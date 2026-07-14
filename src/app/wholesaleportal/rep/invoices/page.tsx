import Link from "next/link";
import { listInvoices, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { money, fullDate } from "@/lib/format";
import { InvoiceBadge, FulfillmentBadge } from "@/components/badges";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function RepInvoicesPage() {
  const invoices = await listInvoices({ limit: 150 });

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Invoices</h1>
        <span className="text-[12px] text-muted">
          Live from Firestore · {invoices.length} total
        </span>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet."
          hint="Generate a formal invoice from a processed invoice request to see it here."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[110px_1.3fr_110px_100px_110px_130px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Invoice</span>
            <span>Buyer</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Due</span>
            <span className="text-center">Status</span>
            <span className="text-center">Fulfillment</span>
          </div>
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/wholesaleportal/rep/invoices/${inv.id}`}
              className="grid grid-cols-[110px_1.3fr_110px_100px_110px_130px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0 hover:bg-ground"
            >
              <span className="font-mono">{inv.invoiceNumber}</span>
              <div>
                <div className="text-ink">{inv.customerName || inv.buyerDisplayName || "—"}</div>
                <div className="font-mono text-[11px] text-muted">
                  {inv.customerCompany || (inv.portalUsername ? `@${inv.portalUsername}` : "—")}
                </div>
              </div>
              <span className="text-right font-mono">{money(inv.total)}</span>
              <span className="text-right text-secondary">
                {inv.dueDate ? fullDate(inv.dueDate) : "—"}
              </span>
              <span className="text-center">
                <InvoiceBadge status={displayInvoiceStatus(inv)} />
              </span>
              <span className="text-center">
                <FulfillmentBadge status={inv.fulfillmentStatus} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
