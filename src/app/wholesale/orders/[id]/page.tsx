import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getQuoteById } from "@/lib/firestore/quotes";
import { getFulfillmentForInvoice, fulfillmentDelivered } from "@/lib/firestore/fulfillment";
import { getInvoiceByNumber, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { getCurationShareForBuyer } from "@/lib/firestore/curation";
import { getLatestBookedCallForQuote } from "@/lib/firestore/bookedCalls";
import { InvoiceBadge } from "@/components/badges";
import { PayInvoiceButton } from "@/components/PayInvoiceButton";
import { isStripeConfigured } from "@/lib/stripe";
import { ShipmentTracking, shipmentBoxesFromRecord } from "@/components/ShipmentTracking";
import { PortalItemLine, portalDisplayTitle } from "@/components/PortalItemLine";
import { MicroBadge } from "@/components/badges";
import { BuyerOrderStatusBadge } from "@/components/BuyerOrderStatusBadge";
import { BundleImageStrip } from "@/components/BundleImageStrip";
import { fullDate, money } from "@/lib/format";
import { RequestPieceCallButton } from "@/components/RequestPieceCallButton";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

type LineItem = {
  sku: string;
  title: string;
  brand: string;
  quantity: number;
  price: number;
  imageUrl: string | null;
  isSuggestedLot: boolean;
  lotItems: Array<{ sku: string; title?: string; imageUrl?: string | null }>;
};

function normalizeItems(raw: Array<Record<string, unknown>>): LineItem[] {
  return raw.map((it) => {
    const rawLotItems = Array.isArray(it.lotItems)
      ? (it.lotItems as Array<Record<string, unknown>>)
      : [];
    const lotItems = rawLotItems
      .map((li) => ({
        sku: String(li?.sku || "").trim(),
        title: li?.title ? String(li.title) : undefined,
        imageUrl: li?.imageUrl ? String(li.imageUrl) : null,
      }))
      .filter((li) => li.sku);
    const directImage = typeof it.imageUrl === "string" && it.imageUrl ? it.imageUrl : null;
    const imageUrl =
      directImage || (lotItems.find((li) => li.imageUrl)?.imageUrl ?? null);
    return {
      sku: String(it.sku || ""),
      title: String(it.title || ""),
      brand: String(it.brand || ""),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
      price: Number(it.price) || 0,
      imageUrl,
      isSuggestedLot: !!it.isSuggestedLot,
      lotItems,
    };
  });
}

export default async function BuyerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const { id } = await params;
  const quote = await getQuoteById(id);
  // Never let one buyer view another buyer's request.
  if (!quote || (quote.portalUsername || "").toLowerCase() !== (session.username || "").toLowerCase()) {
    notFound();
  }

  const items = normalizeItems(quote.items);

  // Once fulfillment ships the invoice, the order shows per-box live tracking.
  const fulfillment =
    quote.shippedAt && quote.invoiceId
      ? await getFulfillmentForInvoice(quote.invoiceId).catch(() => null)
      : null;
  const shipmentBoxes = shipmentBoxesFromRecord(fulfillment);

  // Pay-from-the-order: buyers kept hunting for the Stripe button, which only
  // lived on the invoice page — surface balance + Pay online here too.
  const invoice = quote.invoiceNumber
    ? await getInvoiceByNumber(quote.invoiceNumber).catch(() => null)
    : null;
  const canPayOnline =
    !!invoice && isStripeConfigured() && invoice.status === "SENT" && invoice.balance > 0;

  // Buyer Curate View + call details live here in the portal — buyers
  // shouldn't have to dig through Google Calendar for the links.
  const [curationShare, bookedCall] = await Promise.all([
    quote.curationToken
      ? getCurationShareForBuyer(quote.curationToken).catch(() => null)
      : Promise.resolve(null),
    getLatestBookedCallForQuote(quote.id).catch(() => null),
  ]);

  return (
    <div className="px-8 pb-16 pt-8">
      <Link href="/wholesale/orders" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to order requests
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Order request</h1>
        <span className="font-mono text-[11px] text-muted">#{quote.id}</span>
        <BuyerOrderStatusBadge
          status={quote.status}
          shippedAt={quote.shippedAt}
          fulfilledAt={quote.fulfilledAt}
          delivered={fulfillmentDelivered(fulfillment)}
        />
        {invoice ? <InvoiceBadge status={displayInvoiceStatus(invoice)} /> : null}
        {quote.poNumber ? (
          <span className="font-mono text-[11px] text-secondary">PO {quote.poNumber}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              LINE ITEMS
            </div>
            <div className="space-y-4">
              {items.map((it, index) => (
                <div
                  key={`${it.sku}-${index}`}
                  className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {it.isSuggestedLot ? (
                      <BundleImageStrip
                        images={
                          it.lotItems.length ? it.lotItems.map((li) => li.imageUrl) : [it.imageUrl]
                        }
                        size="sm"
                      />
                    ) : (
                      <PortalItemLine
                        imageUrl={it.imageUrl}
                        title={it.title}
                        sku={it.sku}
                        size="sm"
                        className="min-w-0 flex-1"
                      />
                    )}
                    {it.isSuggestedLot ? (
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <MicroBadge tone="solid-gold">BUNDLE</MicroBadge>
                          <span className="truncate text-[13px] font-medium text-ink">
                            {portalDisplayTitle(it.title, it.sku)}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted">
                          {it.lotItems.length} piece{it.lotItems.length === 1 ? "" : "s"} in this
                          bundle
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[13px] text-ink">{money(Math.round(it.price))}</div>
                    {it.quantity > 1 ? (
                      <div className="font-mono text-[10.5px] text-muted">× {it.quantity}</div>
                    ) : null}
                  </div>
                </div>
              ))}
              {items.length === 0 ? (
                <p className="text-[12.5px] text-muted">No items on this request.</p>
              ) : null}
            </div>
          </div>

          {quote.message ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
                YOUR MESSAGE
              </div>
              <p className="whitespace-pre-wrap text-[12.5px] text-secondary">{quote.message}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {curationShare || bookedCall?.scheduledStartIso ? (
            <div className="rounded-card border border-accent/40 bg-surface p-5">
              <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
                BUYER CURATE VIEW
              </div>
              {bookedCall?.scheduledStartIso ? (
                <p className="mb-2 text-[12.5px] text-secondary">
                  Call scheduled for{" "}
                  <strong className="text-ink">
                    {new Date(bookedCall.scheduledStartIso).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </strong>
                  {bookedCall.durationMinutes ? ` · ${bookedCall.durationMinutes} min` : ""}
                  {bookedCall.staffName ? ` with ${bookedCall.staffName}` : ""}.
                </p>
              ) : null}
              {curationShare ? (
                <>
                  <p className="mb-3 text-[12.5px] text-secondary">
                    Your rep prepared a curate view of pieces for this order — open it to
                    browse and mark what you like{bookedCall ? " before the call" : ""}.
                  </p>
                  <a
                    href={`/curation/${quote.curationToken}`}
                    className="inline-flex h-10 items-center rounded-chip bg-accent px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:opacity-90"
                  >
                    Open Buyer Curate View →
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
          {shipmentBoxes.length > 0 ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <ShipmentTracking boxes={shipmentBoxes} />
            </div>
          ) : quote.shipmentBoxes.length > 0 ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
                SHIPMENT
              </div>
              <div className="space-y-1.5 text-[12.5px]">
                {quote.shipmentBoxes.map((b, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <span className="text-secondary">Box {b.label}</span>
                    <span className="font-mono text-[12px] text-ink">
                      {b.carrier} {b.trackingNumber}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {quote.invoiceNumber ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">INVOICE</div>
                {invoice ? <InvoiceBadge status={displayInvoiceStatus(invoice)} /> : null}
              </div>
              {invoice && invoice.balance > 0 ? (
                <div className="mb-3 flex items-baseline justify-between text-[12.5px]">
                  <span className="text-secondary">Balance due</span>
                  <span className="font-mono text-[16px] font-semibold text-ink">
                    {money(invoice.balance)}
                  </span>
                </div>
              ) : (
                <p className="mb-2 text-[12.5px] text-secondary">
                  {invoice?.status === "PAID"
                    ? "Paid — thank you."
                    : "An invoice has been generated for this request."}
                </p>
              )}
              {canPayOnline ? (
                <div className="mb-3">
                  <PayInvoiceButton
                    invoiceNumber={quote.invoiceNumber}
                    balance={invoice!.balance}
                  />
                  <p className="mt-2 text-center text-[11px] text-muted">
                    Secure checkout by Stripe — or pay by wire via the PDF invoice.
                  </p>
                </div>
              ) : null}
              <Link
                href={`/wholesale/invoices/${quote.invoiceNumber}`}
                className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-accent hover:text-ink"
              >
                View invoice →
              </Link>
            </div>
          ) : null}

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              TOTALS
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row
                label="Merchandise"
                value={quote.cartTotal != null ? money(Math.round(quote.cartTotal)) : "—"}
              />
              <Row
                label={quote.shippingLabel ? `Shipping · ${quote.shippingLabel}` : "Shipping"}
                value={
                  quote.shippingComp ? "Free · comped" : money(Math.round(quote.shipping || 0))
                }
              />
              <Row
                label="Order total"
                value={
                  quote.cartTotal != null
                    ? money(Math.round(quote.cartTotal + (quote.shipping || 0)))
                    : "—"
                }
              />
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              TIMELINE
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Submitted" value={fullDate(quote.createdAt)} />
              <Row label="Last updated" value={fullDate(quote.updatedAt)} />
              {quote.shippedAt ? <Row label="Shipped" value={fullDate(quote.shippedAt)} /> : null}
            </div>
          </div>

          {/* Post-submit questions used to mean emailing or phoning the rep —
              the same call-request flow from the PDP/cart now works here. */}
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              QUESTIONS?
            </div>
            <p className="mb-3 text-[12.5px] text-secondary">
              Want to talk through this order — swaps, pricing, timing? Request a video call
              and your rep will reach out.
            </p>
            <RequestPieceCallButton
              quoteId={quote.id}
              title={
                items.length === 1
                  ? items[0]!.title
                  : `Order #${quote.id.slice(-6).toUpperCase()} · ${items.length} pieces`
              }
              imageUrls={items.map((i) => i.imageUrl)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
