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
import { EditClientAccountButton } from "@/components/EditClientAccountButton";
import { PortalItemLine, PortalThumbnailTile } from "@/components/PortalItemLine";
import { MicroBadge, InvoiceBadge } from "@/components/badges";
import { resolveShippingOption } from "@/lib/constants";
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

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const metrics = computeBuyerAccountMetrics(invoices, quotes);
  const shippingOption = resolveShippingOption(buyer.shippingMethodId);
  const creditPct =
    buyer.creditLimit && buyer.creditLimit > 0
      ? Math.min(100, Math.round((metrics.outstanding / buyer.creditLimit) * 100))
      : null;
  const maxBucket = Math.max(1, ...metrics.monthly.map((b) => b.paidTotal + b.openTotal));

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
              <MicroBadge tone="outline-gold">{buyer.paymentTerms}</MicroBadge>
              <MicroBadge tone="outline-gray">{shippingOption.label}</MicroBadge>
              {buyer.resaleCertVerified ? (
                <MicroBadge tone="solid-gold">RESALE CERT VERIFIED</MicroBadge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={buyer.email ? `mailto:${buyer.email}` : undefined}
            className="inline-flex h-9 items-center rounded-chip border border-border px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition hover:border-accent"
          >
            Message buyer
          </a>
          <EditClientAccountButton buyer={buyer} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="LIFETIME PURCHASES" value={money(metrics.lifetimePurchases)} />
        <MetricCard
          label="OUTSTANDING"
          value={money(metrics.outstanding)}
          caption={
            metrics.outstandingCount > 0
              ? `${metrics.outstandingCount} unpaid${
                  metrics.outstandingDueSoonDays != null
                    ? metrics.outstandingDueSoonDays >= 0
                      ? `, due in ${metrics.outstandingDueSoonDays}d`
                      : `, ${Math.abs(metrics.outstandingDueSoonDays)}d overdue`
                    : ""
                }`
              : "All caught up"
          }
        />
        <MetricCard
          label="OPEN ORDERS"
          value={String(metrics.openOrders)}
          caption={metrics.openOrdersLatestDate ? `submitted ${fullDate(metrics.openOrdersLatestDate)}` : undefined}
        />
        <MetricCard
          label="AVG ORDER VALUE"
          value={metrics.avgOrderValue != null ? money(metrics.avgOrderValue) : "—"}
        />
        <MetricCard
          label="LAST ORDER"
          value={metrics.lastOrderAt ? fullDate(metrics.lastOrderAt) : "—"}
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
              <Row label="Terms" value={buyer.paymentTerms} />
              <Row label="Preferred payment" value={buyer.preferredPayment || "—"} />
              <Row
                label="On-time payment rate"
                value={metrics.onTimePaymentRate != null ? `${metrics.onTimePaymentRate}%` : "—"}
              />
            </div>
            {buyer.creditLimit != null ? (
              <div className="mt-3.5 border-t border-border/60 pt-3.5">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                  <span>Credit used</span>
                  <span className="font-mono">
                    {money(metrics.outstanding)} / {money(buyer.creditLimit)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ground">
                  <div
                    className={
                      "h-full rounded-full " + ((creditPct ?? 0) >= 90 ? "bg-danger" : "bg-accent")
                    }
                    style={{ width: `${creditPct ?? 0}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              SHIPPING PROFILE
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Default method" value={shippingOption.label} />
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
