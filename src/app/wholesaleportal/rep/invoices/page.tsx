import { listInvoices, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { money, fullDate } from "@/lib/format";
import { InvoiceBadge, FulfillmentBadge } from "@/components/badges";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function RepInvoicesPage() {
  const invoices = await listInvoices({ limit: 150 });

  // AR aging over outstanding balances (partial payments already netted out).
  const now = Date.now();
  const aging = { current: 0, d30: 0, d60: 0, d61plus: 0 };
  for (const inv of invoices) {
    if (inv.status === "PAID" || inv.balance <= 0) continue;
    const due = inv.dueDate ? new Date(inv.dueDate).getTime() : null;
    const daysOver = due == null ? 0 : Math.floor((now - due) / 86_400_000);
    if (due == null || daysOver <= 0) aging.current += inv.balance;
    else if (daysOver <= 30) aging.d30 += inv.balance;
    else if (daysOver <= 60) aging.d60 += inv.balance;
    else aging.d61plus += inv.balance;
  }
  const outstanding = aging.current + aging.d30 + aging.d60 + aging.d61plus;

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Invoices</h1>
        <span className="text-[12px] text-muted">
          Live from Firestore · {invoices.length} total
        </span>
      </div>

      {outstanding > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Outstanding", value: outstanding, danger: false },
            { label: "Current", value: aging.current, danger: false },
            { label: "1–30 days over", value: aging.d30, danger: aging.d30 > 0 },
            { label: "31–60 days over", value: aging.d60, danger: aging.d60 > 0 },
            { label: "61+ days over", value: aging.d61plus, danger: aging.d61plus > 0 },
          ].map((b) => (
            <div
              key={b.label}
              className={`rounded-card border p-4 ${
                b.danger ? "border-danger/40 bg-danger/5" : "border-border bg-surface"
              }`}
            >
              <div className="micro-badge mb-2 text-[9.5px] tracking-[0.14em] text-muted">
                {b.label}
              </div>
              <div
                className={`font-mono text-[18px] font-semibold ${
                  b.danger ? "text-danger" : "text-ink"
                }`}
              >
                {money(b.value)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet."
          hint="Generate a formal invoice from a processed order request to see it here."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[110px_1.2fr_100px_100px_110px_120px_90px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Invoice</span>
            <span>Buyer</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Due</span>
            <span className="text-center">Status</span>
            <span className="text-center">Fulfillment</span>
            <span className="text-right"> </span>
          </div>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="grid grid-cols-[110px_1.2fr_100px_100px_110px_120px_90px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
            >
              <span className="font-mono">{inv.invoiceNumber}</span>
              <div className="min-w-0">
                <div className="truncate text-ink">
                  {inv.customerName || inv.buyerDisplayName || "—"}
                </div>
                <div className="truncate font-mono text-[11px] text-muted">
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
              <div className="text-right">
                <a
                  href={`/wholesaleportal/rep/invoices/${inv.id}`}
                  className="inline-flex h-8 items-center rounded-chip bg-ink px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90"
                >
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
