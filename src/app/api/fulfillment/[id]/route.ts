import { NextResponse } from "next/server";
import { requireFulfillmentAccess } from "@/lib/staff-api-auth";
import {
  getOrCreateFulfillment,
  markFulfillmentShipped,
  markFulfillmentUnshipped,
  recordScan,
  removeBox,
  setBoxTracking,
  setBoxParcel,
  attachLabelToBox,
  clearLabelFromBox,
  fulfillmentReadyToShip,
  type FulfillmentRecord,
} from "@/lib/firestore/fulfillment";
import { markInvoiceShipped, markInvoiceUnshipped, type PortalInvoice } from "@/lib/firestore/invoices";
import { attachShipmentToQuote, clearShipmentFromQuote } from "@/lib/firestore/quotes";
import { findBuyerByIdentifier, updateBuyerAccountDetails } from "@/lib/firestore/buyers";
import { getRates, purchaseLabelFromRate, voidLabel, shipEngineConfigured } from "@/lib/shipengine";
import { logAudit } from "@/lib/firestore/audit";
import { sendShippedEmail } from "@/lib/notify";
import { trackingUrlFor, friendlyCarrierName } from "@/lib/tracking";
import { ROLE } from "@/lib/constants";

/**
 * Default insured value for a box: the invoice-line prices of the pieces packed
 * in it. Lot members without their own invoice line fall back to an even share
 * of the invoice total, so a box of lot pieces is never insured for $0.
 */
function boxContentsValue(
  record: FulfillmentRecord,
  invoice: PortalInvoice,
  boxId: string,
): number {
  const skus = Object.entries(record.assignments)
    .filter(([, b]) => b === boxId)
    .map(([sku]) => sku);
  const priceBySku = new Map(invoice.items.map((i) => [i.sku.toUpperCase(), i.price]));
  let value = 0;
  let unknown = 0;
  for (const sku of skus) {
    const p = priceBySku.get(sku.toUpperCase());
    if (p != null && p > 0) value += p;
    else unknown++;
  }
  if (unknown && record.expectedSkus.length) {
    value += (invoice.total / record.expectedSkus.length) * unknown;
  }
  return Math.round(value);
}

export const dynamic = "force-dynamic";

/**
 * Pack-station actions for one invoice:
 *   { action: "scan", code, currentBoxId }
 *   { action: "tracking", boxId, carrier, trackingNumber }
 *   { action: "remove-box", boxId }
 *   { action: "complete" }
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireFulfillmentAccess();
  if (!session) {
    return NextResponse.json({ error: "Sign in to the fulfillment console first." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const invoiceId = String(id || "").trim();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    code?: string;
    currentBoxId?: string | null;
    boxId?: string;
    carrier?: string;
    trackingNumber?: string;
    weightOz?: number;
    lengthIn?: number | null;
    widthIn?: number | null;
    heightIn?: number | null;
    rateId?: string;
    signature?: boolean;
    insure?: boolean;
    insuredValue?: number | null;
    address?: {
      attn?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };

  try {
    if (body.action === "scan") {
      const result = await recordScan(
        invoiceId,
        String(body.code || ""),
        body.currentBoxId || null,
        session.email,
      );
      const readiness = fulfillmentReadyToShip(result.record);
      return NextResponse.json({ ok: true, ...result, readiness });
    }

    if (body.action === "tracking") {
      const record = await setBoxTracking(invoiceId, String(body.boxId || ""), {
        carrier: String(body.carrier || ""),
        trackingNumber: String(body.trackingNumber || ""),
      });
      return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
    }

    if (body.action === "parcel") {
      const record = await setBoxParcel(invoiceId, String(body.boxId || ""), {
        weightOz: Number(body.weightOz),
        lengthIn: body.lengthIn != null ? Number(body.lengthIn) : null,
        widthIn: body.widthIn != null ? Number(body.widthIn) : null,
        heightIn: body.heightIn != null ? Number(body.heightIn) : null,
      });
      return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
    }

    if (body.action === "rates") {
      if (!shipEngineConfigured()) {
        return NextResponse.json({ error: "ShipEngine isn't configured yet." }, { status: 400 });
      }
      const { record, invoice } = await getOrCreateFulfillment(invoiceId);
      const box = record.boxes.find((b) => b.id === body.boxId);
      if (!box) return NextResponse.json({ error: "Box not found." }, { status: 404 });
      // Don't let money get spent on a label for an empty box — pack it first.
      if (!Object.values(record.assignments).includes(box.id)) {
        return NextResponse.json(
          { error: `Box ${box.label} is empty — scan items into it before buying a label.` },
          { status: 400 },
        );
      }
      if (!box.weightOz) {
        return NextResponse.json({ error: "Save the box weight first." }, { status: 400 });
      }
      const buyer = invoice.portalUsername
        ? await findBuyerByIdentifier(invoice.portalUsername).catch(() => null)
        : null;
      if (!buyer?.shippingLine1 || !buyer.shippingCity || !buyer.shippingState || !buyer.shippingPostalCode) {
        // needsAddress lets the pack station open its add-address modal in place.
        return NextResponse.json(
          {
            error: "Buyer has no shipping address on file.",
            needsAddress: true,
            buyerId: buyer?.id || null,
          },
          { status: 400 },
        );
      }
      // Signature defaults to the buyer's account flag; insurance defaults ON
      // (one-of-one pieces) at the value of the box's contents. Both change the
      // quoted price and are baked into whichever rateId gets purchased.
      const signature = body.signature ?? !!buyer.shippingSignatureRequired;
      const insuredValue =
        body.insure === false
          ? null
          : Number(body.insuredValue) > 0
            ? Math.round(Number(body.insuredValue))
            : boxContentsValue(record, invoice, box.id);
      const rates = await getRates(
        {
          name: buyer.shippingAttn || buyer.displayName || invoice.customerName,
          company: buyer.company || undefined,
          phone: buyer.phone || undefined,
          addressLine1: buyer.shippingLine1,
          addressLine2: buyer.shippingLine2 || undefined,
          city: buyer.shippingCity,
          state: buyer.shippingState,
          postalCode: buyer.shippingPostalCode,
          country: buyer.shippingCountry || "US",
        },
        {
          weightOz: box.weightOz,
          lengthIn: box.lengthIn,
          widthIn: box.widthIn,
          heightIn: box.heightIn,
        },
        { signature, insuredValue },
      );
      return NextResponse.json({
        ok: true,
        rates: rates.slice(0, 8),
        applied: { signature, insuredValue },
      });
    }

    if (body.action === "ship-address") {
      // Save the buyer's shipping address from the pack-station modal, so the
      // shipper isn't dead-ended when the account has no address on file.
      const a = body.address || {};
      if (!a.line1?.trim() || !a.city?.trim() || !a.state?.trim() || !a.postalCode?.trim()) {
        return NextResponse.json(
          { error: "Street, city, state, and ZIP are required." },
          { status: 400 },
        );
      }
      const { invoice } = await getOrCreateFulfillment(invoiceId);
      const buyer = invoice.portalUsername
        ? await findBuyerByIdentifier(invoice.portalUsername).catch(() => null)
        : null;
      if (!buyer) {
        return NextResponse.json(
          { error: "No buyer account is linked to this invoice." },
          { status: 400 },
        );
      }
      await updateBuyerAccountDetails(buyer.id, {
        shippingAttn: a.attn ?? "",
        shippingLine1: a.line1,
        shippingLine2: a.line2 ?? "",
        shippingCity: a.city,
        shippingState: a.state,
        shippingPostalCode: a.postalCode,
        shippingCountry: a.country?.trim() || "US",
      });
      await logAudit({
        actor: session,
        action: "fulfillment.ship_address_saved",
        entity: "buyer",
        entityId: buyer.id,
        payload: { invoiceId, city: a.city, state: a.state },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "buy-label") {
      if (!shipEngineConfigured()) {
        return NextResponse.json({ error: "ShipEngine isn't configured yet." }, { status: 400 });
      }
      const rateId = String(body.rateId || "").trim();
      if (!rateId) return NextResponse.json({ error: "Pick a rate first." }, { status: 400 });
      const { record: current } = await getOrCreateFulfillment(invoiceId);
      const target = current.boxes.find((b) => b.id === body.boxId);
      if (!target) return NextResponse.json({ error: "Box not found." }, { status: 404 });
      if (!Object.values(current.assignments).includes(target.id)) {
        return NextResponse.json(
          { error: `Box ${target.label} is empty — scan items into it before buying a label.` },
          { status: 400 },
        );
      }
      const label = await purchaseLabelFromRate(rateId);
      const record = await attachLabelToBox(invoiceId, String(body.boxId || ""), label);
      await logAudit({
        actor: session,
        action: "fulfillment.label_purchased",
        entity: "invoice",
        entityId: invoiceId,
        payload: {
          boxId: String(body.boxId || ""),
          tracking: label.trackingNumber,
          carrier: label.carrier,
          cost: label.cost,
        },
      });
      return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
    }

    if (body.action === "void-label") {
      if (!shipEngineConfigured()) {
        return NextResponse.json({ error: "ShipEngine isn't configured yet." }, { status: 400 });
      }
      const { record: current } = await getOrCreateFulfillment(invoiceId);
      if (current.status === "shipped") {
        return NextResponse.json(
          { error: "Shipment is already marked shipped — unship it first." },
          { status: 400 },
        );
      }
      const box = current.boxes.find((b) => b.id === body.boxId);
      if (!box) return NextResponse.json({ error: "Box not found." }, { status: 404 });
      if (!box.labelId) {
        return NextResponse.json({ error: "No purchased label on this box." }, { status: 400 });
      }
      const result = await voidLabel(box.labelId);
      if (!result.approved) {
        return NextResponse.json(
          { error: result.message || "The carrier declined the void." },
          { status: 400 },
        );
      }
      const record = await clearLabelFromBox(invoiceId, box.id);
      await logAudit({
        actor: session,
        action: "fulfillment.label_voided",
        entity: "invoice",
        entityId: invoiceId,
        payload: { boxId: box.id, labelId: box.labelId, tracking: box.trackingNumber, cost: box.labelCost },
      });
      return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
    }

    if (body.action === "unship") {
      // Admin-only escape hatch for a mistaken "Mark shipped" — PPAS logins
      // can't quietly resurrect a shipment the buyer was already emailed about.
      if (session.role !== ROLE.MANAGER) {
        return NextResponse.json(
          { error: "Only an admin can unship — ask a manager." },
          { status: 403 },
        );
      }
      const record = await markFulfillmentUnshipped(invoiceId, session.email);
      const invoice = await markInvoiceUnshipped(invoiceId, session.email);
      if (invoice.quoteId) {
        await clearShipmentFromQuote(invoice.quoteId).catch((err) =>
          console.warn("[fulfillment] quote unship write failed:", err instanceof Error ? err.message : err),
        );
      }
      await logAudit({
        actor: session,
        action: "fulfillment.unshipped",
        entity: "invoice",
        entityId: invoiceId,
        payload: { invoiceNumber: record.invoiceNumber },
      });
      return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
    }

    if (body.action === "remove-box") {
      const record = await removeBox(invoiceId, String(body.boxId || ""));
      return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
    }

    if (body.action === "complete") {
      const record = await markFulfillmentShipped(invoiceId, session.email);
      const usedBoxIds = new Set(Object.values(record.assignments));
      const usedBoxes = record.boxes.filter((b) => usedBoxIds.has(b.id));
      // Back-compat summary on the invoice (buyer page prefers per-box detail).
      const first = usedBoxes[0]!;
      const firstCarrier = friendlyCarrierName(first.carrier);
      const invoice = await markInvoiceShipped(
        invoiceId,
        {
          carrier: usedBoxes.length > 1 ? `${firstCarrier} (${usedBoxes.length} boxes)` : firstCarrier,
          trackingNumber: first.trackingNumber,
        },
        session.email,
      );
      // Tracking also lands on the originating order request, so the order
      // object carries the shipment — not just the invoice.
      if (invoice.quoteId) {
        await attachShipmentToQuote(
          invoice.quoteId,
          usedBoxes.map((b) => ({
            label: b.label,
            carrier: friendlyCarrierName(b.carrier),
            trackingNumber: b.trackingNumber,
          })),
        ).catch((err) =>
          console.warn("[fulfillment] quote tracking write failed:", err instanceof Error ? err.message : err),
        );
      }
      await logAudit({
        actor: session,
        action: "fulfillment.shipped",
        entity: "invoice",
        entityId: invoiceId,
        payload: {
          invoiceNumber: record.invoiceNumber,
          boxes: usedBoxes.map((b) => `${b.label}:${b.trackingNumber}`),
        },
      });
      // Buyer shipped email with every box's tracking — non-blocking.
      try {
        if (invoice.customerEmail) {
          await sendShippedEmail({
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customerName,
            customerEmail: invoice.customerEmail,
            carrier: firstCarrier,
            trackingNumber: first.trackingNumber,
            trackingUrl: trackingUrlFor(first.carrier, first.trackingNumber),
            boxes: usedBoxes.map((b) => ({
              label: `Box ${b.label}`,
              carrier: friendlyCarrierName(b.carrier),
              trackingNumber: b.trackingNumber,
              trackingUrl: trackingUrlFor(b.carrier, b.trackingNumber),
            })),
          });
        }
      } catch (err) {
        console.warn("[fulfillment] shipped email failed:", err instanceof Error ? err.message : err);
      }
      return NextResponse.json({ ok: true, record });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the shipment." },
      { status: 400 },
    );
  }
}

/** Refresh the record (used by the pack station's polling). */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireFulfillmentAccess();
  if (!session) {
    return NextResponse.json({ error: "Sign in to the fulfillment console first." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const { record } = await getOrCreateFulfillment(String(id || "").trim());
    return NextResponse.json({ ok: true, record, readiness: fulfillmentReadyToShip(record) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the shipment." },
      { status: 400 },
    );
  }
}
