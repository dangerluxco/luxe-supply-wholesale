import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuyerById, getBuyerCart, cartHoldSkus } from "@/lib/firestore/buyers";
import { listQuotesForBuyer } from "@/lib/firestore/quotes";
import { listInvoicesForBuyer } from "@/lib/firestore/invoices";
import { loadActiveHoldsBySku } from "@/lib/firestore/holds";
import { getActiveLotsForBuyer } from "@/lib/firestore/suggestedLots";
import { computeBuyerAccountMetrics } from "@/lib/buyerAccount";
import { EmptyState } from "@/components/EmptyState";
import { ClientCartLimitsForm } from "@/components/ClientCartLimitsForm";
import { ClientPasswordResetButton } from "@/components/ClientPasswordResetButton";
import { AssignCreditButton } from "@/components/AssignCreditButton";
import { EditClientAccountButton } from "@/components/EditClientAccountButton";
import { MessageBuyerButton } from "@/components/MessageBuyerButton";
import { PortalItemLine, PortalThumbnailTile } from "@/components/PortalItemLine";
import { MicroBadge, InvoiceBadge, TierBadge } from "@/components/badges";
import { PAYMENT_TIERS } from "@/lib/constants";
import { getShippingRules } from "@/lib/firestore/settings";
import { enabledShippingMethods, shippingMethodLabel } from "@/lib/shipping-rules";
import { money, fullDate, initialsOf } from "@/lib/format";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="micro-badge mb-2 text-[9.5px] tracking-[0.14em] text-muted">{label}</div>
      <div className="font-mono text-[21px] font-semibold text-ink">{value}</div>
      {caption ? <div className="mt-1 text-[11px] text-muted">{caption}</div> : null}
    </div>
  );
}

/** Sales-performance range presets for the client page (?range=…). */
const RANGE_PRESETS: Array<{ key: string; label: string; days?: number; ytd?: boolean }> = [
  { key: "all", label: "All time" },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "ytd", label: "This year", ytd: true },
  { key: "12m", label: "12 months", days: 365 },
];

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const buyer = await getBuyerById(id);
  if (!buyer) notFound();

  const [quotes, invoices, cart, lots] = await Promise.all([
    listQuotesForBuyer(buyer.username, 30),
    listInvoicesForBuyer(buyer.username),
    getBuyerCart(buyer.id),
    getActiveLotsForBuyer(buyer.username),
  ]);
  const holdSkus = cartHoldSkus(cart);
  const holds = await loadActiveHoldsBySku(holdSkus);
  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  // --- Sales-performance date range (?range=preset or ?from/?to custom) -----
  const parseDay = (v: string | undefined, endOfDay: boolean): number | null => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const t = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
    return Number.isFinite(t) ? t : null;
  };
  const customFrom = parseDay(sp.from, false);
  const customTo = parseDay(sp.to, true);
  const preset =
    customFrom != null || customTo != null
      ? null
      : RANGE_PRESETS.find((p) => p.key === String(sp.range || "all")) || RANGE_PRESETS[0]!;
  const now = Date.now();
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  if (preset) {
    if (preset.days) rangeFrom = now - preset.days * 86_400_000;
    else if (preset.ytd) rangeFrom = new Date(new Date().getFullYear(), 0, 1).getTime();
  } else {
    rangeFrom = customFrom;
    rangeTo = customTo;
  }
  const rangeActive = rangeFrom != null || rangeTo != null;
  const inRange = (d: string | null | undefined): boolean => {
    if (!rangeActive) return true;
    if (!d) return false;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) return false;
    if (rangeFrom != null && t < rangeFrom) return false;
    if (rangeTo != null && t > rangeTo) return false;
    return true;
  };
  const rangeInvoices = rangeActive
    ? invoices.filter((i) => inRange(i.issuedAt || i.createdAt))
    : invoices;
  const rangeQuotes = rangeActive ? quotes.filter((q) => inRange(q.createdAt)) : quotes;
  const chartMonths = rangeActive
    ? Math.min(24, Math.max(1, Math.ceil((now - (rangeFrom ?? now - 6 * 30 * 86_400_000)) / (30 * 86_400_000))))
    : 6;
  const rangeLabel = preset
    ? preset.label
    : [sp.from || "…", sp.to || "today"].join(" → ");

  // Range-scoped view for sales performance; full-history view for
  // current-state numbers (outstanding balance, credit exposure, open orders).
  const metrics = computeBuyerAccountMetrics(rangeInvoices, rangeQuotes, { months: chartMonths });
  const metricsAll = rangeActive ? computeBuyerAccountMetrics(invoices, quotes) : metrics;
  const shippingRules = await getShippingRules();
  const shippingMethodName = shippingMethodLabel(shippingRules, buyer.shippingMethodId) ?? "—";
  const creditPct =
    buyer.creditLimit && buyer.creditLimit > 0
      ? Math.min(100, Math.round((metricsAll.outstanding / buyer.creditLimit) * 100))
      : null;
  const maxBucket = Math.max(1, ...metrics.monthly.map((b) => b.paidTotal + b.openTotal));
  const basePath = `/wholesaleportal/rep/clients/${encodeURIComponent(buyer.id)}`;

  return (
    <div className="px-10 pb-12 pt-8">
      <Link
        href="/wholesaleportal/rep/clients"
        className="text-[12px] text-muted transition hover:text-ink"
      >
        ‹ Back to clients
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-ground">
            {initialsOf(buyer.displayName || buyer.username)}
          </div>
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-[24px] font-semibold text-ink">
                {buyer.displayName || `@${buyer.username}`}
              </h1>
              <span className="font-mono text-[11px] text-muted">@{buyer.username}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">
              {[buyer.company, [buyer.city, buyer.state].filter(Boolean).join(", "), fullDate(buyer.createdAt) !== "—" ? `buyer since ${fullDate(buyer.createdAt)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <MicroBadge tone={buyer.status === "active" ? "solid-green" : "outline-gray"}>
                {buyer.status.toUpperCase()}
              </MicroBadge>
              <TierBadge tier={buyer.paymentTier} />
              <MicroBadge tone="outline-gold">{buyer.paymentTerms}</MicroBadge>
              <MicroBadge tone="outline-gray">{shippingMethodName}</MicroBadge>
              {buyer.resaleCertVerified ? (
                <MicroBadge tone="solid-gold">RESALE CERT VERIFIED</MicroBadge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {/* Plain <a> (not next/link): staff console uses hard navigation to avoid a Next 15 soft-nav webpack bug. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href={`/wholesaleportal/rep/curation?buyerId=${encodeURIComponent(buyer.id)}`}
            className="inline-flex h-9 items-center rounded-chip bg-accent px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition hover:opacity-90"
          >
            + New order request
          </a>
          <MessageBuyerButton buyerId={buyer.id} disabled={!buyer.email} />
          <AssignCreditButton buyer={buyer} outstanding={metrics.outstanding} />
          <EditClientAccountButton
            buyer={buyer}
            shippingMethods={enabledShippingMethods(shippingRules).map((m) => ({
              id: m.id,
              label: m.label,
            }))}
          />
        </div>
      </div>

      {/* Sales-performance date range — scopes purchases, AOV, the purchase
          chart, and order history. Outstanding/credit stay current-state. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="micro-badge text-[9.5px] tracking-[0.14em] text-muted">SALES RANGE</span>
        {RANGE_PRESETS.map((p) => {
          const active = preset?.key === p.key;
          return (
            <a
              key={p.key}
              href={p.key === "all" ? basePath : `${basePath}?range=${p.key}`}
              className={`rounded-chip px-2.5 py-1 text-[11px] tracking-[0.06em] ${
                active
                  ? "bg-ink text-ground"
                  : "border border-border text-secondary hover:border-accent"
              }`}
            >
              {p.label}
            </a>
          );
        })}
        <form action={basePath} method="get" className="ml-1 flex items-center gap-1.5">
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
              !preset
                ? "bg-ink text-ground"
                : "border border-border text-secondary hover:border-accent"
            }`}
          >
            Apply
          </button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label={rangeActive ? "PURCHASES · RANGE" : "LIFETIME PURCHASES"}
          value={money(metrics.lifetimePurchases)}
          caption={rangeActive ? rangeLabel : undefined}
        />
        <MetricCard
          label="OUTSTANDING"
          value={money(metricsAll.outstanding)}
          caption={
            metricsAll.outstandingCount > 0
              ? `${metricsAll.outstandingCount} unpaid${
                  metricsAll.outstandingDueSoonDays != null
                    ? metricsAll.outstandingDueSoonDays >= 0
                      ? `, due in ${metricsAll.outstandingDueSoonDays}d`
                      : `, ${Math.abs(metricsAll.outstandingDueSoonDays)}d overdue`
                    : ""
                }`
              : "All caught up"
          }
        />
        <MetricCard
          label="OPEN ORDERS"
          value={String(metricsAll.openOrders)}
          caption={
            metricsAll.openOrdersLatestDate
              ? `submitted ${fullDate(metricsAll.openOrdersLatestDate)}`
              : undefined
          }
        />
        <MetricCard
          label={rangeActive ? "AVG ORDER · RANGE" : "AVG ORDER VALUE"}
          value={metrics.avgOrderValue != null ? money(metrics.avgOrderValue) : "—"}
        />
        <MetricCard
          label="LAST ORDER"
          value={metricsAll.lastOrderAt ? fullDate(metricsAll.lastOrderAt) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
                PURCHASE HISTORY
              </div>
              <div className="flex items-center gap-3 text-[10.5px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" /> Paid
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px] border border-accent/70"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(176,141,62,0.35) 0 2px, transparent 2px 4px)",
                    }}
                  />
                  Open
                </span>
              </div>
            </div>
            {metrics.monthly.every((b) => b.paidTotal + b.openTotal === 0) ? (
              <p className="text-[12.5px] text-muted">No purchase history yet.</p>
            ) : (
              <div className="flex h-36 items-end gap-3">
                {metrics.monthly.map((b) => {
                  const paidH = Math.round((b.paidTotal / maxBucket) * 120);
                  const openH = Math.round((b.openTotal / maxBucket) * 120);
                  return (
                    <div key={b.monthKey} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="flex h-[120px] w-full flex-col-reverse items-center">
                        <div
                          className="w-full max-w-[36px] rounded-t-[3px] bg-accent"
                          style={{ height: `${paidH}px` }}
                          title={money(b.paidTotal)}
                        />
                        {openH > 0 ? (
                          <div
                            className="w-full max-w-[36px] rounded-t-[3px] border border-b-0 border-accent/70"
                            style={{
                              height: `${openH}px`,
                              backgroundImage:
                                "repeating-linear-gradient(45deg, rgba(176,141,62,0.35) 0 2px, transparent 2px 4px)",
                            }}
                            title={`${money(b.openTotal)} open`}
                          />
                        ) : null}
                      </div>
                      <span className="font-mono text-[10.5px] text-muted">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              ORDER HISTORY
            </div>
            {metrics.orderHistory.length === 0 ? (
              <p className="text-[12.5px] text-muted">No order requests or invoices yet.</p>
            ) : (
              <div className="overflow-hidden rounded-chip border border-border">
                <div className="grid grid-cols-[1fr_1fr_60px_90px_100px_72px] gap-x-3 border-b border-border bg-ground px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <span>Date</span>
                  <span>Reference</span>
                  <span className="text-center">Items</span>
                  <span className="text-right">Total</span>
                  <span>Status</span>
                  <span className="text-right"> </span>
                </div>
                {metrics.orderHistory.map((row) => (
                  <div
                    key={`${row.kind}-${row.id}`}
                    className="grid grid-cols-[1fr_1fr_60px_90px_100px_72px] gap-x-3 items-center border-b border-border/60 px-4 py-3 text-[12.5px] transition last:border-b-0 hover:bg-ground/70"
                  >
                    <span className="font-mono text-[11px] text-muted">{fullDate(row.date)}</span>
                    <span className="font-mono text-[11px] text-ink">{row.reference}</span>
                    <span className="text-center font-mono">{row.itemCount}</span>
                    <span className="text-right font-mono">{money(row.total)}</span>
                    <span>
                      {row.kind === "invoice" ? (
                        <InvoiceBadge status={row.status} />
                      ) : (
                        <MicroBadge tone="outline-gray">{row.status.toUpperCase()}</MicroBadge>
                      )}
                    </span>
                    <div className="text-right">
                      <a
                        href={row.href}
                        className="inline-flex h-7 items-center rounded-chip bg-ink px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ground transition hover:opacity-90"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              CURRENT CART / HOLDS
            </div>
            {cart.length === 0 ? (
              <p className="text-[12.5px] text-muted">Cart is empty.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {cart.map((item, index) => {
                    const hold = holds.get(item.sku);
                    const lotSkus = item.isSuggestedLot
                      ? (item.lotItems || []).map((li) => li.sku).filter(Boolean)
                      : [];
                    return (
                      <div
                        key={`${item.sku}-${index}`}
                        className="flex items-center justify-between gap-3 text-[12.5px]"
                      >
                        <PortalItemLine
                          imageUrl={item.imageUrl}
                          title={item.title}
                          sku={item.isSuggestedLot ? undefined : item.sku}
                          subtitle={
                            item.isSuggestedLot
                              ? `Suggested lot · ${lotSkus.length || item.lotItems?.length || 0} SKUs${
                                  hold?.heldUntil
                                    ? ` · held until ${new Date(hold.heldUntil).toLocaleString()}`
                                    : ""
                                }`
                              : hold?.heldUntil
                                ? `Held until ${new Date(hold.heldUntil).toLocaleString()}`
                                : undefined
                          }
                          size="md"
                        />
                        <span className="shrink-0 font-mono">{money(item.price)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[12.5px]">
                  <span className="text-muted">Cart total</span>
                  <span className="font-mono font-semibold">{money(cartTotal)}</span>
                </div>
              </>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              ACTIVE SUGGESTED LOTS
            </div>
            {lots.length === 0 ? (
              <p className="text-[12.5px] text-muted">No active suggested lots for this client.</p>
            ) : (
              <div className="space-y-4">
                {lots.map((lot) => (
                  <div key={lot.id} className="border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-[13px] font-semibold text-ink">{lot.title}</div>
                      <span className="font-mono text-[12.5px]">
                        {lot.lotPrice != null ? money(lot.lotPrice) : "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lot.items.map((it, i) => (
                        <PortalThumbnailTile
                          key={`${lot.id}-${it.sku}-${i}`}
                          imageUrl={it.imageUrl || it.imageUrls?.[0] || null}
                          title={it.title}
                          sku={it.sku}
                        />
                      ))}
                    </div>
                    <Link
                      href={`/wholesaleportal/rep/bundles/${lot.id}/edit`}
                      className="mt-2 inline-block text-[11px] uppercase tracking-[0.1em] text-muted hover:text-ink"
                    >
                      Edit lot
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              PAYMENT TERMS &amp; STANDING
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row
                label="Payment tier"
                value={PAYMENT_TIERS.find((t) => t.tier === buyer.paymentTier)?.label || `Tier ${buyer.paymentTier}`}
              />
              <Row label="Terms" value={buyer.paymentTerms} />
              <Row label="Preferred payment" value={buyer.preferredPayment || "—"} />
              <Row
                label="On-time payment rate"
                value={metrics.onTimePaymentRate != null ? `${metrics.onTimePaymentRate}%` : "—"}
              />
            </div>
            <div className="mt-3.5 border-t border-border/60 pt-3.5">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted">
                <span>{buyer.creditLimit != null ? "Credit used" : "Credit limit"}</span>
                <AssignCreditButton
                  buyer={buyer}
                  outstanding={metrics.outstanding}
                  variant="link"
                />
              </div>
              {buyer.creditLimit != null ? (
                <>
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[12px] text-ink">
                    <span>
                      {money(metrics.outstanding)} / {money(buyer.creditLimit)}
                    </span>
                    <span className="text-muted">{creditPct ?? 0}% used</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ground">
                    <div
                      className={
                        "h-full rounded-full " +
                        ((creditPct ?? 0) >= 90 ? "bg-danger" : "bg-accent")
                      }
                      style={{ width: `${creditPct ?? 0}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] text-muted">
                  No credit assigned — buyer is cash / due-on-receipt until a limit is set.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              SHIPPING PROFILE
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Default method" value={shippingMethodName} />
              <Row label="Attn" value={buyer.shippingAttn || "—"} />
              <Row
                label="Address"
                value={
                  [buyer.shippingLine1, buyer.shippingLine2].filter(Boolean).join(", ") || "—"
                }
              />
              <Row
                label="City / state / ZIP"
                value={
                  [buyer.shippingCity, buyer.shippingState, buyer.shippingPostalCode]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              <Row label="Signature required" value={buyer.shippingSignatureRequired ? "Yes" : "No"} />
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              CONTACT
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Email" value={buyer.email || "—"} />
              <Row label="Company" value={buyer.company || "—"} />
              <Row label="EIN" value={buyer.ein || "—"} />
              <Row label="Phone" value={buyer.phone || "—"} />
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              ACCOUNT
            </div>
            <div className="mb-4 space-y-2 text-[12.5px]">
              <Row label="Created" value={fullDate(buyer.createdAt)} />
              <Row label="Last login" value={fullDate(buyer.lastLoginAt)} />
              <Row label="Status" value={buyer.status} />
            </div>
            <ClientPasswordResetButton
              buyerId={buyer.id}
              buyerEmail={buyer.email}
              disabled={buyer.status === "disabled"}
            />
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              ORDER HOLD LIMITS
            </div>
            <ClientCartLimitsForm
              buyerId={buyer.id}
              maxCartItems={buyer.maxCartItems}
              maxCartValue={buyer.maxCartValue}
            />
          </div>

          {quotes.length === 0 && cart.length === 0 ? (
            <EmptyState
              title="No activity yet."
              hint="This buyer hasn't started an order or submitted an order request."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
