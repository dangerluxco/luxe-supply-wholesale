import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";
import { BuyerOrderStatusBadge } from "@/components/BuyerOrderStatusBadge";
import { InvoiceBadge } from "@/components/badges";
import { listQuotesForBuyer, type PortalQuote } from "@/lib/firestore/quotes";
import { listInvoicesForBuyer, displayInvoiceStatus } from "@/lib/firestore/invoices";
import {
  listFulfillmentRecordsByInvoiceIds,
  fulfillmentDelivered,
} from "@/lib/firestore/fulfillment";
import { money, fullDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Buyers track their own monthly buying quotas (one client targets $300k/mo),
// so the list filters by payment bucket + date range and shows bucket totals.
const RANGE_PRESETS: Array<{ key: string; label: string; days?: number; ytd?: boolean }> = [
  { key: "all", label: "All time" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "month", label: "This month" },
  { key: "ytd", label: "This year" },
];

const BUCKET_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "unpaid", label: "Unpaid" },
  { key: "in_progress", label: "In review" },
];

function parseDay(v: string | undefined, endOfDay: boolean): number | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Payment bucket for a quote: paid / unpaid (invoiced, balance open) / in_progress (pre-invoice) / other. */
function bucketFor(q: PortalQuote, invStatus: string | undefined): string {
  if (invStatus === "PAID") return "paid";
  if (invStatus) return "unpaid";
  if (q.status === "open" || q.status === "contacted") return "in_progress";
  return "other";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; range?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");
  const sp = await searchParams;

  const [allQuotes, invoices] = await Promise.all([
    listQuotesForBuyer(session.username || ""),
    listInvoicesForBuyer(session.username || "").catch(() => []),
  ]);
  const invoiceStatusByNumber = new Map(
    invoices.map((inv) => [inv.invoiceNumber, displayInvoiceStatus(inv)]),
  );

  // Delivered detection: tracking webhook stamps each box; all-delivered → DELIVERED pill.
  const shippedInvoiceIds = allQuotes
    .filter((q) => q.shippedAt && q.invoiceId)
    .map((q) => q.invoiceId!) as string[];
  const fulfillmentByInvoiceId = shippedInvoiceIds.length
    ? await listFulfillmentRecordsByInvoiceIds(shippedInvoiceIds).catch(
        () => new Map<string, never>(),
      )
    : new Map<string, never>();
  const deliveredFor = (q: PortalQuote): boolean =>
    !!q.invoiceId && fulfillmentDelivered(fulfillmentByInvoiceId.get(q.invoiceId) || null);

  // --- Date range (?range preset or ?from/?to custom, on submission date) ---
  const customFrom = parseDay(sp.from, false);
  const customTo = parseDay(sp.to, true);
  const preset =
    customFrom != null || customTo != null
      ? null
      : RANGE_PRESETS.find((p) => p.key === String(sp.range || "all")) || RANGE_PRESETS[0]!;
  const now = new Date();
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  if (preset) {
    if (preset.days) rangeFrom = now.getTime() - preset.days * 86_400_000;
    else if (preset.key === "month")
      rangeFrom = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else if (preset.ytd) rangeFrom = new Date(now.getFullYear(), 0, 1).getTime();
  } else {
    rangeFrom = customFrom;
    rangeTo = customTo;
  }
  const rangeActive = rangeFrom != null || rangeTo != null;
  const inRange = (iso: string | null): boolean => {
    if (!rangeActive) return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return false;
    if (rangeFrom != null && t < rangeFrom) return false;
    if (rangeTo != null && t > rangeTo) return false;
    return true;
  };

  const rangeQuotes = allQuotes.filter((q) => inRange(q.createdAt));
  const orderTotal = (q: PortalQuote): number =>
    Math.round((q.cartTotal || 0) + (q.shipping || 0));

  // Bucket totals over the date range (not the bucket filter — the chips ARE the filter).
  const totals = { paid: 0, unpaid: 0, in_progress: 0, count: 0, grand: 0 } as Record<
    string,
    number
  >;
  const bucketByQuoteId = new Map<string, string>();
  for (const q of rangeQuotes) {
    const bucket = bucketFor(
      q,
      q.invoiceNumber ? invoiceStatusByNumber.get(q.invoiceNumber) : undefined,
    );
    bucketByQuoteId.set(q.id, bucket);
    if (bucket in totals) totals[bucket] = (totals[bucket] || 0) + orderTotal(q);
    if (bucket !== "other") {
      totals.grand += orderTotal(q);
      totals.count += 1;
    }
  }

  const filter = BUCKET_FILTERS.some((b) => b.key === sp.f) ? String(sp.f) : "all";
  const quotes =
    filter === "all"
      ? rangeQuotes
      : rangeQuotes.filter((q) => bucketByQuoteId.get(q.id) === filter);

  // Preserve the other dimension when toggling one filter.
  const rangeParams = preset
    ? preset.key === "all"
      ? ""
      : `&range=${preset.key}`
    : `${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`;
  const hrefFor = (f: string) => `/wholesale/orders?f=${f}${rangeParams}`;

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Order requests</h1>
      <p className="mt-1 text-[13px] text-secondary">
        New requests start as Pending approval while the sales team reviews them — the
        status updates here as your order is worked, invoiced, paid, and shipped.
      </p>

      {/* Range + totals — buyers tracking a monthly buying target start here. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">RANGE</span>
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`/wholesale/orders?f=${filter}${p.key === "all" ? "" : `&range=${p.key}`}`}
            className={`rounded-chip px-2.5 py-1 text-[11px] tracking-[0.06em] ${
              preset?.key === p.key
                ? "bg-ink text-ground"
                : "border border-border text-secondary hover:border-accent"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <form action="/wholesale/orders" method="get" className="ml-1 flex items-center gap-1.5">
          <input type="hidden" name="f" value={filter} />
          <input
            type="date"
            name="from"
            defaultValue={sp.from || ""}
            className="h-7 rounded-chip border border-border bg-surface px-2 font-mono text-[11px] text-ink outline-none focus:border-accent"
          />
          <span className="text-[11px] text-muted">→</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to || ""}
            className="h-7 rounded-chip border border-border bg-surface px-2 font-mono text-[11px] text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            className={`rounded-chip px-2.5 py-1 text-[11px] tracking-[0.06em] ${
              !preset ? "bg-ink text-ground" : "border border-border text-secondary hover:border-accent"
            }`}
          >
            Apply
          </button>
        </form>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: "all", label: "ORDERED · RANGE", value: totals.grand, caption: `${totals.count} orders` },
          { key: "paid", label: "PAID", value: totals.paid, caption: "settled invoices" },
          { key: "unpaid", label: "UNPAID", value: totals.unpaid, caption: "invoiced, balance open" },
          { key: "in_progress", label: "IN REVIEW", value: totals.in_progress, caption: "pre-invoice" },
        ].map((c) => (
          <Link
            key={c.key}
            href={hrefFor(c.key)}
            className={`rounded-card border p-4 transition hover:border-accent ${
              filter === c.key ? "border-accent bg-accent/5" : "border-border bg-surface"
            }`}
          >
            <div className="micro-badge mb-1.5 text-[9.5px] tracking-[0.14em] text-muted">
              {c.label}
            </div>
            <div className="font-mono text-[19px] font-semibold text-ink">
              {money(Math.round(c.value))}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">{c.caption}</div>
          </Link>
        ))}
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          title={
            filter !== "all" || rangeActive
              ? "No orders match this filter."
              : "You haven't submitted an order request yet."
          }
          hint={
            filter !== "all" || rangeActive
              ? "Adjust the range or bucket above."
              : "Add pieces to your order and submit for review from your cart — it will show up here."
          }
          className="mt-8"
        />
      ) : (
        // min-w + overflow-x: the table scrolls inside its own card on phones
        // instead of forcing the whole page to overflow.
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[760px]">
          <div className="grid grid-cols-[110px_1fr_80px_100px_170px_120px_70px] gap-x-4 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Date</span>
            <span>Request</span>
            <span className="text-center">Items</span>
            <span className="text-right">Total</span>
            <span className="text-center">Status</span>
            <span className="text-center">Invoice</span>
            <span />
          </div>
          {quotes.map((q) => (
            <Link
              key={q.id}
              href={`/wholesale/orders/${q.id}`}
              className="grid grid-cols-[110px_1fr_80px_100px_170px_120px_70px] gap-x-4 items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground/70"
            >
              <span className="font-mono text-[11px] text-muted">{fullDate(q.createdAt)}</span>
              <div className="min-w-0">
                <div className="truncate text-ink">
                  {q.message ? q.message.slice(0, 70) : "Order request"}
                </div>
                <div className="font-mono text-[11px] text-muted">#{q.id}</div>
              </div>
              <span className="text-center font-mono">{q.itemCount}</span>
              <span className="text-right font-mono">
                {q.cartTotal != null ? money(orderTotal(q)) : "—"}
              </span>
              <span className="flex flex-wrap items-center justify-center gap-1">
                <BuyerOrderStatusBadge
                  status={q.status}
                  shippedAt={q.shippedAt}
                  fulfilledAt={q.fulfilledAt}
                  delivered={deliveredFor(q)}
                />
                {q.invoiceNumber && invoiceStatusByNumber.has(q.invoiceNumber) ? (
                  <InvoiceBadge status={invoiceStatusByNumber.get(q.invoiceNumber)!} />
                ) : null}
              </span>
              <span className="text-center">
                {q.invoiceNumber ? (
                  <span className="font-mono text-[11px] text-accent">{q.invoiceNumber} →</span>
                ) : (
                  <span className="text-[11px] text-muted">—</span>
                )}
              </span>
              <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                View →
              </span>
            </Link>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
