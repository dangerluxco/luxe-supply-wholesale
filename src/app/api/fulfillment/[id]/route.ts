import { NextResponse } from "next/server";
import { requireFulfillmentAccess } from "@/lib/staff-api-auth";
import {
  getOrCreateFulfillment,
  markFulfillmentShipped,
  recordScan,
  removeBox,
  setBoxTracking,
  setBoxParcel,
  attachLabelToBox,
  fulfillmentReadyToShip,
} from "@/lib/firestore/fulfillment";
import { markInvoiceShipped } from "@/lib/firestore/invoices";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { getRates, purchaseLabelFromRate, shipEngineConfigured } from "@/lib/shipengine";
import { logAudit } from "@/lib/firestore/audit";
import { sendShippedEmail } from "@/lib/notify";
import { trackingUrlFor } from "@/lib/tracking";

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
      if (!box.weightOz) {
        return NextResponse.json({ error: "Save the box weight first." }, { status: 400 });
      }
      const buyer = invoice.portalUsername
        ? await findBuyerByIdentifier(invoice.portalUsername).catch(() => null)
        : null;
      if (!buyer?.shippingLine1 || !buyer.shippingCity || !buyer.shippingState || !buyer.shippingPostalCode) {
        return NextResponse.json(
          { error: "Buyer has no shipping address on file — set it on the client account first." },
          { status: 400 },
        );
      }
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
      );
      return NextResponse.json({ ok: true, rates: rates.slice(0, 8) });
    }

    if (body.action === "buy-label") {
      if (!shipEngineConfigured()) {
        return NextResponse.json({ error: "ShipEngine isn't configured yet." }, { status: 400 });
      }
      const rateId = String(body.rateId || "").trim();
      if (!rateId) return NextResponse.json({ error: "Pick a rate first." }, { status: 400 });
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
      const invoice = await markInvoiceShipped(
        invoiceId,
        {
          carrier: usedBoxes.length > 1 ? `${first.carrier} (${usedBoxes.length} boxes)` : first.carrier,
          trackingNumber: first.trackingNumber,
        },
        session.email,
      );
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
            carrier: first.carrier,
            trackingNumber: first.trackingNumber,
            trackingUrl: trackingUrlFor(first.carrier, first.trackingNumber),
            boxes: usedBoxes.map((b) => ({
              label: `Box ${b.label}`,
              carrier: b.carrier,
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
