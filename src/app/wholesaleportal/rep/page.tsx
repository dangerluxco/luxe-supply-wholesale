import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { invoiceRequestDaysLeft, ROLE } from "@/lib/constants";
import { listQuotes } from "@/lib/firestore/quotes";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EmptyState } from "@/components/EmptyState";
import { QuotesTable } from "@/components/QuotesTable";
import { InfoTip } from "@/components/InfoTip";

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
  // Default to the active pipeline (open + contacted) — matching the dashboard's
  // "open requests" KPI — so the landing view is never empty while deals are live.
  const status = String(params.status || "active").toLowerCase();
  const { quotes, openCount, activeCount } = await listQuotes({ status, limit: 50 });

  const pipeline = [
    { label: "Active", status: "active", href: "/wholesaleportal/rep?status=active" },
    { label: "Open", status: "open", href: "/wholesaleportal/rep?status=open" },
    { label: "Contacted", status: "contacted", href: "/wholesaleportal/rep?status=contacted" },
    { label: "Invoiced", status: "quoted", href: "/wholesaleportal/rep?status=quoted" },
    // Packed & ready to ship but held for payment (pay-first buyers) — the
    // unpaid-inventory-on-the-shelf view.
    { label: "Fulfilled", status: "fulfilled", href: "/wholesaleportal/rep?status=fulfilled" },
    { label: "Timed out", status: "timed_out", href: "/wholesaleportal/rep?status=timed_out" },
    { label: "All", status: "all", href: "/wholesaleportal/rep?status=all" },
  ];

  return (
    <div className="px-10 pb-12 pt-8">
      {/* The main work queue must catch new submissions and teammates' claims
          without a manual reload — same 20s visible-tab poll as the dashboard. */}
      <AutoRefresh />
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
          Live from Firestore · {activeCount} active ({openCount} open)
        </span>
        <div className="flex-1" />
        <a
          href="/api/staff/export/quotes"
          className="pressable rounded-chip border border-border px-3 py-1.5 text-[11px] text-secondary hover:border-accent hover:text-ink"
        >
          Export CSV
        </a>
        <Link
          href="/wholesaleportal/rep/clients"
          className="pressable rounded-chip border border-border px-3 py-1.5 text-[11px] text-secondary hover:border-accent hover:text-ink"
        >
          View clients
        </Link>
        <Link
          href="/wholesaleportal/rep/curation"
          className="pressable inline-flex h-10 items-center rounded-chip bg-accent px-4 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink hover:opacity-90"
        >
          + New order request
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
        <QuotesTable
          currentStaffEmail={session.email}
          rows={quotes.map((q) => ({
            id: q.id,
            name: q.customerName || q.buyerDisplayName || q.customerEmail || "—",
            email: q.customerEmail || "",
            company: q.customerCompany || "",
            username: q.portalUsername || "",
            itemCount: q.itemCount,
            total: q.cartTotal != null ? q.cartTotal + (q.shipping || 0) : null,
            waiting: elapsed(q.createdAt),
            timesOutDays: invoiceRequestDaysLeft(q.createdAt, q.status),
            status: q.status,
            claimedByEmail: q.claimedByEmail,
            claimedByName: q.claimedByName,
          }))}
        />
      )}
    </div>
  );
}
