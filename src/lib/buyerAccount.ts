import type { PortalInvoice } from "@/lib/firestore/invoices";
import type { PortalQuote } from "@/lib/firestore/quotes";

const OPEN_QUOTE_STATUSES = new Set(["open", "contacted", "quoted"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export type OrderHistoryRow = {
  id: string;
  kind: "invoice" | "quote";
  date: string | null;
  reference: string;
  itemCount: number;
  total: number;
  status: string;
  href: string;
};

export type MonthlyBucket = {
  monthKey: string;
  label: string;
  paidTotal: number;
  openTotal: number;
};

export type BuyerAccountMetrics = {
  lifetimePurchases: number;
  outstanding: number;
  outstandingCount: number;
  outstandingDueSoonDays: number | null;
  openOrders: number;
  openOrdersLatestDate: string | null;
  avgOrderValue: number | null;
  lastOrderAt: string | null;
  onTimePaymentRate: number | null;
  monthly: MonthlyBucket[];
  orderHistory: OrderHistoryRow[];
};

function monthKeyOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function quoteReference(q: PortalQuote): string {
  return `REQ-${q.id.slice(-4).toUpperCase()}`;
}

export function computeBuyerAccountMetrics(
  invoices: PortalInvoice[],
  quotes: PortalQuote[],
  opts?: { months?: number },
): BuyerAccountMetrics {
  const months = opts?.months ?? 6;

  const paidInvoices = invoices.filter((i) => i.status === "PAID");
  const sentInvoices = invoices.filter((i) => i.status === "SENT");
  const openQuotes = quotes.filter((q) => !q.invoiceId && OPEN_QUOTE_STATUSES.has(q.status));

  const lifetimePurchases = paidInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const outstanding = sentInvoices.reduce((s, i) => s + (i.total || 0), 0);

  let outstandingDueSoonDays: number | null = null;
  for (const inv of sentInvoices) {
    if (!inv.dueDate) continue;
    const days = Math.ceil((new Date(inv.dueDate).getTime() - Date.now()) / DAY_MS);
    if (outstandingDueSoonDays === null || days < outstandingDueSoonDays) outstandingDueSoonDays = days;
  }

  const openOrdersLatestDate = openQuotes.reduce<string | null>((latest, q) => {
    if (!q.createdAt) return latest;
    if (!latest || q.createdAt > latest) return q.createdAt;
    return latest;
  }, null);

  const billedInvoices = [...paidInvoices, ...sentInvoices];
  const avgOrderValue =
    billedInvoices.length > 0
      ? billedInvoices.reduce((s, i) => s + (i.total || 0), 0) / billedInvoices.length
      : null;

  const allDates = [
    ...invoices.map((i) => i.issuedAt || i.createdAt),
    ...quotes.map((q) => q.createdAt),
  ].filter((d): d is string => !!d);
  const lastOrderAt = allDates.length > 0 ? allDates.sort().at(-1)! : null;

  const onTimeEligible = paidInvoices.filter((i) => i.dueDate && i.paidAt);
  const onTimePaymentRate =
    onTimeEligible.length > 0
      ? Math.round(
          (onTimeEligible.filter((i) => new Date(i.paidAt!).getTime() <= new Date(i.dueDate!).getTime())
            .length /
            onTimeEligible.length) *
            100,
        )
      : null;

  const now = new Date();
  const bucketOrder: MonthlyBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    bucketOrder.push({
      monthKey,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      paidTotal: 0,
      openTotal: 0,
    });
  }
  const bucketByKey = new Map(bucketOrder.map((b) => [b.monthKey, b]));
  for (const inv of paidInvoices) {
    const key = monthKeyOf(inv.paidAt || inv.issuedAt || inv.createdAt);
    const bucket = key ? bucketByKey.get(key) : null;
    if (bucket) bucket.paidTotal += inv.total || 0;
  }
  for (const q of openQuotes) {
    const key = monthKeyOf(q.createdAt);
    const bucket = key ? bucketByKey.get(key) : null;
    if (bucket) bucket.openTotal += (q.cartTotal || 0) + (q.shipping || 0);
  }

  const invoiceRows: OrderHistoryRow[] = invoices.map((inv) => ({
    id: inv.id,
    kind: "invoice",
    date: inv.issuedAt || inv.createdAt,
    reference: inv.invoiceNumber || inv.id,
    itemCount: inv.itemCount,
    total: inv.total,
    status:
      inv.status === "SENT" && inv.dueDate && new Date(inv.dueDate).getTime() < Date.now()
        ? "OVERDUE"
        : inv.status,
    href: `/wholesaleportal/rep/invoices/${inv.id}`,
  }));
  const quoteRows: OrderHistoryRow[] = quotes
    .filter((q) => !q.invoiceId)
    .map((q) => ({
      id: q.id,
      kind: "quote",
      date: q.createdAt,
      reference: quoteReference(q),
      itemCount: q.itemCount,
      total: (q.cartTotal || 0) + (q.shipping || 0),
      status: q.status.charAt(0).toUpperCase() + q.status.slice(1),
      href: `/wholesaleportal/rep/quotes/${q.id}`,
    }));

  const orderHistory = [...invoiceRows, ...quoteRows]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 20);

  return {
    lifetimePurchases,
    outstanding,
    outstandingCount: sentInvoices.length,
    outstandingDueSoonDays,
    openOrders: openQuotes.length,
    openOrdersLatestDate,
    avgOrderValue,
    lastOrderAt,
    onTimePaymentRate,
    monthly: bucketOrder,
    orderHistory,
  };
}
