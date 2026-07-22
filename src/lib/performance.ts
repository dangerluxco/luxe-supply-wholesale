// Pure aggregation for the staff performance dashboard — no Firestore imports here
// so this stays easy to reason about/test independent of the data layer.
//
// Definitions (see FR-015 technical notes):
//   Sales       = sum of invoice totals CREATED by a staff member in the date range
//   Invoices    = count of invoices created by that staff member in the range
//   AOV         = Sales ÷ Invoices
//   Calls       = curation sessions created by that staff member in the range
//                 (best-effort proxy — there's no dedicated call log in this app;
//                  every "Book call" / curation session creates exactly one of these)
//   Conversion  = (quotes claimed by the staff member in-range that currently have
//                  an invoice) ÷ (quotes claimed by the staff member in-range)
//                 This is a live snapshot: a quote claimed in-range that gets
//                 invoiced later will count toward conversion once it does.

export type StaffInput = { email: string; name: string };
export type InvoiceInput = {
  createdBy: string;
  total: number;
  createdAt: string | null;
  /** Firestore invoice status — "PAID" splits Total (paid) vs Pending sales. */
  status?: string;
  /** Line-item units on the invoice. */
  units?: number;
  /** Gross margin $ for items with a known cost (null = no cost data). */
  margin?: number | null;
  /** Sales $ covered by known-cost items — denominator for margin %. */
  marginKnownSales?: number;
};
export type QuoteInput = {
  claimedByEmail: string | null;
  invoiceId: string | null;
  claimedAt: string | null;
};
export type CallSessionInput = { createdByEmail: string; createdAt: string | null };

export type StaffPerformanceRow = {
  email: string;
  name: string;
  sales: number;
  /** Sales on invoices marked PAID ("Total sales" in the meeting's language). */
  paidSales: number;
  /** Sales on unpaid invoices ("Pending sales"). */
  pendingSales: number;
  invoices: number;
  units: number;
  marginDollars: number;
  /** Sales $ backed by known-cost items — margin % denominator. */
  marginKnownSales: number;
  /** Margin % over the sales that have cost data (null when none do). */
  marginPct: number | null;
  aov: number | null;
  quotesClaimed: number;
  quotesInvoiced: number;
  conversionPct: number | null;
  calls: number;
};

export type TeamSummary = {
  totalSales: number;
  totalPaidSales: number;
  totalPendingSales: number;
  totalInvoices: number;
  totalUnits: number;
  totalMarginDollars: number;
  totalMarginPct: number | null;
  avgAov: number | null;
  totalCalls: number;
};

function inRange(iso: string | null, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
}

function normEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

export function computeStaffPerformance(input: {
  staff: StaffInput[];
  invoices: InvoiceInput[];
  quotes: QuoteInput[];
  callSessions: CallSessionInput[];
  from: Date;
  to: Date;
}): StaffPerformanceRow[] {
  const { staff, invoices, quotes, callSessions, from, to } = input;

  const rows = new Map<string, StaffPerformanceRow>();
  function blankRow(email: string, name: string): StaffPerformanceRow {
    return {
      email,
      name: name || email,
      sales: 0,
      paidSales: 0,
      pendingSales: 0,
      invoices: 0,
      units: 0,
      marginDollars: 0,
      marginKnownSales: 0,
      marginPct: null,
      aov: null,
      quotesClaimed: 0,
      quotesInvoiced: 0,
      conversionPct: null,
      calls: 0,
    };
  }
  for (const s of staff) {
    const email = normEmail(s.email);
    if (!email) continue;
    rows.set(email, blankRow(email, s.name));
  }

  function ensure(email: string, fallbackName: string): StaffPerformanceRow {
    const key = normEmail(email);
    let row = rows.get(key);
    if (!row) {
      row = blankRow(key, fallbackName);
      rows.set(key, row);
    }
    return row;
  }

  for (const inv of invoices) {
    if (!inv.createdBy || !inRange(inv.createdAt, from, to)) continue;
    const row = ensure(inv.createdBy, inv.createdBy);
    const total = Number(inv.total) || 0;
    row.sales += total;
    if (String(inv.status || "").toUpperCase() === "PAID") row.paidSales += total;
    else row.pendingSales += total;
    row.invoices += 1;
    row.units += Number(inv.units) || 0;
    if (inv.margin != null) {
      row.marginDollars += inv.margin;
      row.marginKnownSales += Number(inv.marginKnownSales) || 0;
    }
  }

  for (const q of quotes) {
    if (!q.claimedByEmail || !inRange(q.claimedAt, from, to)) continue;
    const row = ensure(q.claimedByEmail, q.claimedByEmail);
    row.quotesClaimed += 1;
    if (q.invoiceId) row.quotesInvoiced += 1;
  }

  for (const c of callSessions) {
    if (!c.createdByEmail || !inRange(c.createdAt, from, to)) continue;
    const row = ensure(c.createdByEmail, c.createdByEmail);
    row.calls += 1;
  }

  for (const row of rows.values()) {
    row.aov = row.invoices > 0 ? row.sales / row.invoices : null;
    row.conversionPct =
      row.quotesClaimed > 0 ? Math.round((row.quotesInvoiced / row.quotesClaimed) * 1000) / 10 : null;
    row.marginPct =
      row.marginKnownSales > 0
        ? Math.round((row.marginDollars / row.marginKnownSales) * 1000) / 10
        : null;
  }

  return [...rows.values()].sort((a, b) => b.sales - a.sales);
}

export function computeTeamSummary(rows: StaffPerformanceRow[]): TeamSummary {
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalPaidSales = rows.reduce((s, r) => s + r.paidSales, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoices, 0);
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const totalMarginDollars = rows.reduce((s, r) => s + r.marginDollars, 0);
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  // Weighted team margin % over rows that have margin data.
  const knownSales = rows.reduce((s, r) => s + r.marginKnownSales, 0);
  return {
    totalSales,
    totalPaidSales,
    totalPendingSales: totalSales - totalPaidSales,
    totalInvoices,
    totalUnits,
    totalMarginDollars,
    totalMarginPct:
      knownSales > 0 ? Math.round((totalMarginDollars / knownSales) * 1000) / 10 : null,
    avgAov: totalInvoices > 0 ? totalSales / totalInvoices : null,
    totalCalls,
  };
}

/** Buckets invoice totals by day within the range for the "sales over time" line chart. */
export function computeDailySales(
  invoices: InvoiceInput[],
  from: Date,
  to: Date,
): { date: string; total: number }[] {
  const days: { date: string; total: number }[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const byDay = new Map<string, number>();

  for (const inv of invoices) {
    if (!inv.createdAt || !inRange(inv.createdAt, from, to)) continue;
    const d = new Date(inv.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) || 0) + (Number(inv.total) || 0));
  }

  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    days.push({ date: key, total: byDay.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return days;
}

/** Buckets invoice margin $ by day — the margin-over-time line. Days without cost data plot 0. */
export function computeDailyMargin(
  invoices: InvoiceInput[],
  from: Date,
  to: Date,
): { date: string; total: number }[] {
  return computeDailySales(
    invoices.map((inv) => ({ ...inv, total: inv.margin ?? 0 })),
    from,
    to,
  );
}

export type DateRangePreset = "today" | "week" | "month" | "year" | "custom";

/** Resolves a preset (or explicit from/to) into concrete UTC-local day boundaries. */
export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (preset === "custom" && customFrom && customTo) {
    const from = startOfDay(new Date(customFrom));
    const to = endOfDay(new Date(customTo));
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from <= to) {
      return { from, to };
    }
  }

  if (preset === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (preset === "week") {
    const dow = now.getDay(); // 0 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dow + 6) % 7));
    return { from: startOfDay(monday), to: endOfDay(now) };
  }
  if (preset === "year") {
    return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
  }
  // month (default)
  return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
}
