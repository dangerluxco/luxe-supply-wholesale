import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { INVOICE_STATUS, ROLE, tierForSpend } from "@/lib/constants";
import { money } from "@/lib/format";
import { TierBadge } from "@/components/badges";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSession();
  const isManager = session!.role === ROLE.MANAGER;

  const accounts = await prisma.account.findMany({
    where: isManager ? {} : { assignedRepId: session!.id },
    include: {
      assignedRep: true,
      _count: { select: { buyers: true } },
      invoices: { where: { status: { in: [INVOICE_STATUS.SENT, INVOICE_STATUS.OVERDUE] } } },
    },
    orderBy: { trailing12Spend: "desc" },
  });

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Accounts</h1>
        <span className="text-[12px] text-muted">
          {isManager ? "All accounts" : "Your book"} · tier by trailing-12-month spend
        </span>
      </div>

      {accounts.length === 0 ? (
        <EmptyState title="No accounts yet." hint="Won leads convert into accounts here." />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1.6fr_90px_1fr_120px_100px_120px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Company</span>
            <span className="text-center">Tier</span>
            <span>Rep</span>
            <span className="text-right">T-12 spend</span>
            <span className="text-center">Buyers</span>
            <span className="text-right">Open balance</span>
          </div>
          {accounts.map((a) => {
            const open = a.invoices.reduce((s, i) => s + i.total, 0);
            return (
              <div
                key={a.id}
                className="grid grid-cols-[1.6fr_90px_1fr_120px_100px_120px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0 hover:bg-ground"
              >
                <span className="font-semibold text-ink">{a.company}</span>
                <span className="text-center">
                  <TierBadge tier={tierForSpend(a.trailing12Spend)} />
                </span>
                <span>{a.assignedRep?.name ?? "—"}</span>
                <span className="text-right font-mono">{money(a.trailing12Spend)}</span>
                <span className="text-center font-mono">{a._count.buyers}</span>
                <span className="text-right font-mono">{open ? money(open) : "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
