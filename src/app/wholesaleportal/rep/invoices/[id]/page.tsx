import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoiceById, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { money, fullDate } from "@/lib/format";
import { InvoiceBadge, FulfillmentBadge } from "@/components/badges";
import { InvoiceMarkPaidButton } from "@/components/InvoiceMarkPaidButton";
import { InvoiceFulfillmentForm } from "@/components/InvoiceFulfillmentForm";
import { PortalItemLine } from "@/components/PortalItemLine";

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

  return (
    <div className="px-10 pb-12 pt-8">
      <Link href="/wholesaleportal/rep/invoices" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to invoices
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-4">
        <h1 className="font-mono text-[24px] font-semibold text-ink">{invoice.invoiceNumber}</h1>
        <span className="text-[13px] text-secondary">
          {invoice.customerName || invoice.buyerDisplayName || "—"}
        </span>
        <div className="flex-1" />
        <InvoiceBadge status={status} />
        <FulfillmentBadge status={invoice.fulfillmentStatus} />
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
                Shipping <span className="font-mono text-ink">{money(invoice.shipping)}</span>
              </div>
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
                <Row label="Tracking" value={invoice.trackingNumber || "—"} />
                <Row label="Shipped" value={fullDate(invoice.shippedAt)} />
              </div>
            ) : (
              <InvoiceFulfillmentForm invoiceId={invoice.id} />
            )}
          </div>
        </div>

        <div className="space-y-6">
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
            ‹ Back to originating invoice request
          </Link>
        </div>
      </div>
    </div>
  );
}
