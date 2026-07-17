import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listQuotes } from "@/lib/firestore/quotes";
import { EmptyState } from "@/components/EmptyState";
import { QuoteStatusSelect } from "@/components/QuoteStatusSelect";
import { QuoteClaimControls } from "@/components/QuoteClaimControls";
import { InfoTip } from "@/components/InfoTip";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

function elapsed(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function RepDashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role === ROLE.BUYER) redirect("/wholesaleportal/sign-in");

  const params = await searchParams;
  const status = String(params.status || "open").toLowerCase();
  const { quotes, openCount } = await listQuotes({ status, limit: 50 });

  const pipeline = [
    { label: "Open", status: "open", href: "/wholesaleportal/rep?status=open" },
    { label: "Contacted", status: "contacted", href: "/wholesaleportal/rep?status=contacted" },
    { label: "Invoiced", status: "quoted", href: "/wholesaleportal/rep?status=quoted" },
    { label: "Timed out", status: "timed_out", href: "/wholesaleportal/rep?status=timed_out" },
    { label: "All", status: "all", href: "/wholesaleportal/rep?status=all" },
  ];

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-4">
        <h1 className="flex items-center gap-2 text-[24px] font-semibold text-ink">
          Order requests
          <InfoTip label="How order-request holds work">
            Items stay on soft hold while a request is open or contacted. Generating an
            invoice (or setting status to Invoiced) marks those SKUs sold and removes them
            from the storefront. Removing a line item releases its hold immediately. If a
            request stays pending more than 7 days, it times out — holds are cleared and
            any suggested lots in that request are deactivated.
          </InfoTip>
        </h1>
        <span className="text-[12px] text-muted">
          Live from Firestore · {openCount} open
        </span>
        <div className="flex-1" />
        <Link
          href="/wholesaleportal/rep/clients"
          className="rounded-chip border border-border px-3 py-1.5 text-[11px] text-secondary hover:border-accent hover:text-ink"
        >
          View clients
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {pipeline.map((p) => (
          <Link
            key={p.status}
            href={p.href}
            className={`rounded-chip px-3 py-1.5 text-[11px] tracking-[0.06em] ${
              status === p.status
                ? "bg-ink text-ground"
                : "border border-border text-secondary hover:border-accent"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          title="No order requests in this filter."
          hint="Buyer storefront order-request submissions land here from Firestore."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1fr_0.85fr_52px_72px_60px_110px_minmax(180px,1.15fr)_72px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Customer</span>
            <span>Company / buyer</span>
            <span className="text-center">Items</span>
            <span className="text-right">Total</span>
            <span className="text-center">Waiting</span>
            <span>Status</span>
            <span>Assigned</span>
            <span className="text-right"> </span>
          </div>
          {quotes.map((q) => {
            const name = q.customerName || q.buyerDisplayName || q.customerEmail || "—";
            const href = `/wholesaleportal/rep/quotes/${q.id}`;
            return (
              <div
                key={q.id}
                className="grid grid-cols-[1fr_0.85fr_52px_72px_60px_110px_minmax(180px,1.15fr)_72px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{name}</div>
                  <div className="truncate font-mono text-[11px] text-muted">
                    {q.customerEmail || "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate">{q.customerCompany || "—"}</div>
                  <div className="font-mono text-[11px] text-muted">
                    {q.portalUsername ? `@${q.portalUsername}` : "guest"}
                  </div>
                </div>
                <div className="text-center font-mono">{q.itemCount}</div>
                <div className="text-right font-mono">
                  {q.cartTotal != null
                    ? money(Math.round(q.cartTotal + (q.shipping || 0)))
                    : "—"}
                </div>
                <div className="text-center font-mono text-muted">{elapsed(q.createdAt)}</div>
                <QuoteStatusSelect
                  quoteId={q.id}
                  status={q.status}
                />
                <QuoteClaimControls
                  quoteId={q.id}
                  claimedByEmail={q.claimedByEmail}
                  claimedByName={q.claimedByName}
                  currentStaffEmail={session.email}
                  compact
                />
                <div className="text-right">
                  <a
                    href={href}
                    className="inline-flex h-8 items-center rounded-chip bg-ink px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90"
                  >
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
