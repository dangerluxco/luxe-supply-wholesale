import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoiceById, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { getFulfillmentRecord } from "@/lib/firestore/fulfillment";
import { money, fullDate } from "@/lib/format";
import { InvoiceBadge, FulfillmentBadge } from "@/components/badges";
import { InvoiceMarkPaidButton } from "@/components/InvoiceMarkPaidButton";
import { InvoicePaymentsPanel } from "@/components/InvoicePaymentsPanel";
import { PackingNoteForm } from "@/components/PackingNoteForm";
import { PortalItemLine } from "@/components/PortalItemLine";
import { trackingUrlFor } from "@/lib/tracking";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

export default async function StaffInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const status = displayInvoiceStatus(invoice);
  const fulfillment = await getFulfillmentRecord(invoice.id).catch(() => null);
  // Actual carrier spend (ShipEngine label purchases) vs what the buyer was
  // charged — the shipping margin on this order. Manual-tracking boxes have no
  // labelCost, so this only shows once at least one label was bought in-app.
  const labelCost = (fulfillment?.boxes || []).reduce((s, b) => s + (b.labelCost ?? 0), 0);

  return (
    <div className="px-10 pb-12 pt-8">
      <Link href="/wholesaleportal/rep/invoices" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to invoices
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-center gap-4">
        <h1 className="font-mono text-[24px] font-semibold text-ink">{invoice.invoiceNumber}</h1>
        <span className="text-[13px] text-secondary">
          {invoice.customerName || invoice.buyerDisplayName || "—"}
        </span>
        <div className="flex-1" />
        <InvoiceBadge status={status} />
        <FulfillmentBadge status={invoice.fulfillmentStatus} />
        <a
          href={`/api/staff/invoices/${invoice.id}/pdf`}
          className="flex h-9 items-center rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ground transition hover:opacity-90"
        >
          Download PDF ↓
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">
              LINE ITEMS
            </div>
            <div className="overflow-hidden rounded-chip border border-border">
              <div className="grid grid-cols-[1fr_100px_50px_110px] border-b border-border bg-ground px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <span>Item</span>
                <span>Brand</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
              </div>
              {invoice.items.map((item, i) => (
                <div
                  key={`${item.sku}-${i}`}
                  className="grid grid-cols-[1fr_100px_50px_110px] items-center border-b border-border/60 px-4 py-3 text-[12.5px] last:border-b-0"
                >
                  <PortalItemLine imageUrl={item.imageUrl} title={item.title} sku={item.sku} />
                  <span className="text-secondary">{item.brand || "—"}</span>
                  <span className="text-center font-mono">{item.quantity}</span>
                  <span className="text-right font-mono text-ink">{money(item.price)}</span>
                </div>
              ))}
            </div>

            <div className="ml-auto mt-4 w-64 text-[12.5px]">
              <div className="flex justify-between py-1 text-secondary">
                Subtotal <span className="font-mono text-ink">{money(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 text-secondary">
                <span>
                  Shipping
                  {invoice.shippingLabel ? (
                    <span className="text-muted"> · {invoice.shippingLabel}</span>
                  ) : null}
                </span>
                {invoice.shippingComp ? (
                  <span className="font-mono text-ink">
                    <s className="mr-1.5 text-muted">{money(invoice.shippingComp.baseFee)}</s>
                    Free
                  </span>
                ) : (
                  <span className="font-mono text-ink">{money(invoice.shipping)}</span>
                )}
              </div>
              {invoice.shippingComp ? (
                <p className="py-0.5 text-right text-[11px] text-muted">
                  Comped — order of {money(invoice.shippingComp.threshold)}+ ships free
                </p>
              ) : null}
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-[13px] font-semibold text-ink">Total</span>
                <span className="font-mono text-[20px] font-semibold text-ink">{money(invoice.total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">
              FULFILLMENT
            </div>
            {invoice.fulfillmentStatus === "SHIPPED" ? (
              <div className="space-y-2 text-[12.5px]">
                <Row label="Carrier" value={invoice.carrier || "—"} />
                {trackingUrlFor(invoice.carrier, invoice.trackingNumber) ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Tracking</span>
                    <a
                      href={trackingUrlFor(invoice.carrier, invoice.trackingNumber)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-right font-mono text-accent underline"
                    >
                      {invoice.trackingNumber}
                    </a>
                  </div>
                ) : (
                  <Row label="Tracking" value={invoice.trackingNumber || "—"} />
                )}
                <Row label="Shipped" value={fullDate(invoice.shippedAt)} />
                {labelCost > 0 ? (
                  <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                    <Row label="Shipping charged" value={money(invoice.shipping)} />
                    <Row label="Label cost" value={`$${labelCost.toFixed(2)}`} />
                    <Row
                      label="Shipping margin"
                      value={`${invoice.shipping - labelCost < 0 ? "-" : ""}$${Math.abs(invoice.shipping - labelCost).toFixed(2)}`}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <Link
                  href={`/fulfillment/${invoice.id}`}
                  className="mb-3 flex h-9 items-center justify-center rounded-chip bg-accent text-[11px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:opacity-90"
                >
                  Open pack station →
                </Link>
                <p className="text-[11px] text-muted">
                  Shipping happens in the pack station — pieces are scanned into boxes and every box
                  gets tracking before the order can be marked shipped.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <PackingNoteForm invoiceId={invoice.id} initialNote={invoice.packingNote} />

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">
              INVOICE STATUS
            </div>
            <div className="space-y-3 text-[12.5px]">
              <Row label="Issued" value={fullDate(invoice.issuedAt)} />
              <Row label="Due" value={fullDate(invoice.dueDate)} />
              <Row label="Terms" value={invoice.terms} />
              {invoice.paidAt ? <Row label="Paid" value={fullDate(invoice.paidAt)} /> : null}
              {status !== "PAID" ? (
                <div className="pt-1">
                  <InvoiceMarkPaidButton invoiceId={invoice.id} />
                </div>
              ) : null}
            </div>
          </div>

          <InvoicePaymentsPanel
            invoiceId={invoice.id}
            total={invoice.total}
            amountPaid={invoice.amountPaid}
            balance={invoice.balance}
            payments={invoice.payments}
            paid={invoice.status === "PAID"}
          />

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">
              BUYER
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Name" value={invoice.customerName || invoice.buyerDisplayName || "—"} />
              <Row label="Email" value={invoice.customerEmail || "—"} />
              <Row label="Company" value={invoice.customerCompany || "—"} />
              <Row
                label="Username"
                value={invoice.portalUsername ? `@${invoice.portalUsername}` : "guest"}
              />
            </div>
          </div>

          <Link
            href={`/wholesaleportal/rep/quotes/${invoice.quoteId}`}
            className="block rounded-card border border-dashed border-border px-5 py-4 text-[12px] text-muted transition hover:border-accent hover:text-ink"
          >
            ‹ Back to originating order request
          </Link>
        </div>
      </div>
    </div>
  );
}
