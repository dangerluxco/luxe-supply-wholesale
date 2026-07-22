import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listStaff } from "@/lib/firestore/staff";
import { listInvoices } from "@/lib/firestore/invoices";
import { listQuotes } from "@/lib/firestore/quotes";
import { listCurationSessionsInRange } from "@/lib/firestore/curation";
import {
  computeStaffPerformance,
  computeDailySales,
  resolveDateRange,
  type DateRangePreset,
} from "@/lib/performance";
import { StaffPerformanceDetail, type RecentInvoiceRow, type RecentOrderRow } from "@/components/StaffPerformanceDetail";
import { MicroBadge } from "@/components/badges";
import { fullDate, initialsOf } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }
  if (session.role !== ROLE.MANAGER) {
    redirect("/wholesaleportal/rep");
  }

  const { id } = await params;
  const staffList = await listStaff();
  const staff = staffList.find((s) => s.id === id);
  if (!staff) notFound();

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const validPresets: DateRangePreset[] = ["today", "week", "month", "year", "custom"];
  const presetParam = one(sp.preset);
  const preset: DateRangePreset = validPresets.includes(presetParam as DateRangePreset)
    ? (presetParam as DateRangePreset)
    : "month";
  const customFrom = one(sp.from);
  const customTo = one(sp.to);
  const { from, to } = resolveDateRange(preset, customFrom, customTo);

  const email = staff.email.trim().toLowerCase();

  let recentInvoices: RecentInvoiceRow[] = [];
  let recentOrders: RecentOrderRow[] = [];
  let dailySales: { date: string; total: number }[] = [];
  let performanceRow = {
    email,
    name: staff.displayName || email,
    sales: 0,
    paidSales: 0,
    pendingSales: 0,
    invoices: 0,
    units: 0,
    marginDollars: 0,
    marginKnownSales: 0,
    marginPct: null as number | null,
    aov: null as number | null,
    quotesClaimed: 0,
    quotesInvoiced: 0,
    conversionPct: null as number | null,
    calls: 0,
  };
  let loadError: string | null = null;

  try {
    const [invoiceList, quotesResult, callSessions] = await Promise.all([
      listInvoices({ limit: 1000 }),
      listQuotes({ status: "all", limit: 500 }),
      listCurationSessionsInRange(from.toISOString(), to.toISOString()).catch(() => []),
    ]);
    const quoteList = quotesResult.quotes;

    const myInvoices = invoiceList.filter((i) => (i.createdBy || "").trim().toLowerCase() === email);
    const myQuotes = quoteList.filter((q) => (q.claimedByEmail || "").trim().toLowerCase() === email);
    const myCalls = callSessions.filter((c) => (c.createdByEmail || "").trim().toLowerCase() === email);

    const invoiceInput = myInvoices.map((i) => ({
      createdBy: i.createdBy || "",
      total: i.total || 0,
      createdAt: i.createdAt,
    }));

    const [row] = computeStaffPerformance({
      staff: [{ email, name: staff.displayName || email }],
      invoices: invoiceInput,
      quotes: myQuotes.map((q) => ({
        claimedByEmail: q.claimedByEmail,
        invoiceId: q.invoiceId,
        claimedAt: q.claimedAt,
      })),
      callSessions: myCalls,
      from,
      to,
    });
    performanceRow = row;
    dailySales = computeDailySales(invoiceInput, from, to);

    recentInvoices = myInvoices
      .filter((i) => i.createdAt && new Date(i.createdAt) >= from && new Date(i.createdAt) <= to)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 12)
      .map((i) => ({
        id: i.id,
        reference: i.invoiceNumber || i.id,
        customerName: i.customerName || i.customerCompany || "—",
        total: i.total || 0,
        status: i.status,
        createdAt: i.createdAt,
      }));

    recentOrders = myQuotes
      .filter((q) => q.claimedAt && new Date(q.claimedAt) >= from && new Date(q.claimedAt) <= to)
      .sort((a, b) => String(b.claimedAt || "").localeCompare(String(a.claimedAt || "")))
      .slice(0, 12)
      .map((q) => ({
        id: q.id,
        customerName: q.customerName || q.buyerDisplayName || "—",
        itemCount: q.itemCount || 0,
        total: Math.round((q.cartTotal || 0) + (q.shipping || 0)),
        status: q.status,
        createdAt: q.claimedAt,
        invoiced: !!q.invoiceId,
      }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load performance data.";
    console.warn("[staff detail] load failed:", loadError);
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <Link href="/wholesaleportal/rep/settings/people" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to staff
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-ground">
          {initialsOf(staff.displayName || staff.email)}
        </div>
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-[24px] font-semibold text-ink">{staff.displayName || staff.email}</h1>
            <span className="font-mono text-[11px] text-muted">{staff.email}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <MicroBadge tone={staff.isAdmin ? "solid-gold" : "outline-gold"}>
              {staff.isAdmin ? "MANAGER" : "REP"}
            </MicroBadge>
            <MicroBadge tone={staff.status === "active" ? "solid-green" : "outline-gray"}>
              {staff.status.toUpperCase()}
            </MicroBadge>
            {staff.lastLoginAt ? (
              <span className="inline-flex items-center rounded-[5px] px-2 py-[3px] text-[10px] text-muted">
                Last login {fullDate(staff.lastLoginAt)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-chip border border-danger/40 bg-danger/5 px-4 py-3 text-[12.5px] text-danger">
          {loadError}
        </div>
      ) : null}

      <StaffPerformanceDetail
        row={performanceRow}
        dailySales={dailySales}
        preset={preset}
        from={from.toISOString()}
        to={to.toISOString()}
        recentInvoices={recentInvoices}
        recentOrders={recentOrders}
      />
    </div>
  );
}
