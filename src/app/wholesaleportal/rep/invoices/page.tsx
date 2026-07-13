import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { money, shortDate } from "@/lib/format";
import { InvoiceBadge } from "@/components/badges";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function RepInvoicesPage() {
  const session = await getSession();
  const isManager = session!.role === ROLE.MANAGER;

  const invoices = await prisma.invoice.findMany({
    where: isManager ? {} : { account: { assignedRepId: session!.id } },
    include: { account: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Invoices</h1>
        <span className="text-[12px] text-muted">
          {isManager ? "All accounts" : "Your accounts"} · {invoices.length} total
        </span>
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet." />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[110px_1.4fr_110px_100px_110px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Invoice</span>
            <span>Account</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Due</span>
            <span className="text-center">Status</span>
          </div>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="grid grid-cols-[110px_1.4fr_110px_100px_110px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0 hover:bg-ground"
            >
              <span className="font-mono">{inv.number}</span>
              <span>{inv.account.company}</span>
              <span className="text-right font-mono">{money(inv.total)}</span>
              <span className="text-right text-secondary">
                {inv.dueDate ? shortDate(inv.dueDate) : "—"}
              </span>
              <span className="text-center">
                <InvoiceBadge status={inv.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
