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
  computeDailyMargin,
  resolveDateRange,
  type DateRangePreset,
  type StaffPerformanceRow,
} from "@/lib/performance";
import { loadProductOverridesBySku } from "@/lib/firestore/productOverrides";
import { loadInventoryCostsBySkus } from "@/lib/firestore/catalog";
import { PerformanceDashboard } from "@/components/PerformanceDashboard";
import { requirePortalFeature } from "@/lib/require-feature";

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
  await requirePortalFeature("performance");

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
  let dailyMargin: { date: string; total: number }[] = [];
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

    // Cost basis for margin: staff cost override wins, else IIQ inventory cost.
    // Only in-range invoices' SKUs are fetched to bound the chunked queries.
    const inRangeInvoices = invoiceList.filter((i) => {
      if (!i.createdAt) return false;
      const t = new Date(i.createdAt).getTime();
      return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
    });
    const skus = [...new Set(inRangeInvoices.flatMap((i) => i.items.map((it) => it.sku)))];
    const [overrides, inventoryCosts] = await Promise.all([
      loadProductOverridesBySku(skus).catch(() => new Map()),
      loadInventoryCostsBySkus(skus).catch(() => new Map<string, number>()),
    ]);
    const costFor = (sku: string): number | null => {
      const o = overrides.get(sku);
      if (o?.costOverride != null && o.costOverride > 0) return o.costOverride;
      const inv = inventoryCosts.get(sku);
      return inv != null && inv > 0 ? inv : null;
    };

    const invoiceInput = invoiceList.map((i) => {
      let units = 0;
      let margin: number | null = null;
      let marginKnownSales = 0;
      for (const it of i.items) {
        const qty = Math.max(1, Number(it.quantity) || 1);
        units += qty;
        const cost = costFor(it.sku);
        if (cost != null) {
          margin = (margin ?? 0) + (it.price - cost) * qty;
          marginKnownSales += it.price * qty;
        }
      }
      return {
        createdBy: i.createdBy || "",
        total: i.total || 0,
        createdAt: i.createdAt,
        status: i.status,
        units,
        margin,
        marginKnownSales,
      };
    });

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
    dailyMargin = computeDailyMargin(invoiceInput, from, to);
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
        dailyMargin={dailyMargin}
        preset={preset}
        from={from.toISOString()}
        to={to.toISOString()}
        staffIdByEmail={staffIdByEmail}
      />
    </div>
  );
}
