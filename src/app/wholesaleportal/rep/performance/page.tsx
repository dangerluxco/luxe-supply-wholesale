import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listInvoices } from "@/lib/firestore/invoices";
import { listQuotes } from "@/lib/firestore/quotes";
import { listStaff } from "@/lib/firestore/staff";
import { listCurationSessionsInRange } from "@/lib/firestore/curation";
import {
  computeStaffPerformance,
  computeTeamSummary,
  computeDailySales,
  resolveDateRange,
  type DateRangePreset,
  type StaffPerformanceRow,
} from "@/lib/performance";
import { PerformanceDashboard } from "@/components/PerformanceDashboard";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }
  if (session.role !== ROLE.MANAGER) {
    redirect("/wholesaleportal/rep");
  }

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

  let rows: StaffPerformanceRow[] = [];
  let dailySales: { date: string; total: number }[] = [];
  let staffIdByEmail: Record<string, string> = {};
  let loadError: string | null = null;

  try {
    const [staffList, invoiceList, quotesResult, callSessions] = await Promise.all([
      listStaff(),
      listInvoices({ limit: 1000 }),
      listQuotes({ status: "all", limit: 500 }),
      listCurationSessionsInRange(from.toISOString(), to.toISOString()).catch(() => []),
    ]);
    const quoteList = quotesResult.quotes;

    const invoiceInput = invoiceList.map((i) => ({
      createdBy: i.createdBy || "",
      total: i.total || 0,
      createdAt: i.createdAt,
    }));

    rows = computeStaffPerformance({
      staff: staffList.map((s) => ({ email: s.email, name: s.displayName || s.email })),
      invoices: invoiceInput,
      quotes: quoteList.map((q) => ({
        claimedByEmail: q.claimedByEmail,
        invoiceId: q.invoiceId,
        claimedAt: q.claimedAt,
      })),
      callSessions,
      from,
      to,
    });
    dailySales = computeDailySales(invoiceInput, from, to);
    staffIdByEmail = Object.fromEntries(
      staffList
        .map((s) => [s.email.trim().toLowerCase(), s.id] as const)
        .filter(([email]) => email),
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load performance data.";
    console.warn("[performance] load failed:", loadError);
  }

  const team = computeTeamSummary(rows);

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Performance</h1>
        <span className="text-[12px] text-muted">
          Sales, invoices, and conversion by staff member — computed live from Firestore.
        </span>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-chip border border-danger/40 bg-danger/5 px-4 py-3 text-[12.5px] text-danger">
          {loadError}
        </div>
      ) : null}

      <PerformanceDashboard
        rows={rows}
        team={team}
        dailySales={dailySales}
        preset={preset}
        from={from.toISOString()}
        to={to.toISOString()}
        staffIdByEmail={staffIdByEmail}
      />
    </div>
  );
}
