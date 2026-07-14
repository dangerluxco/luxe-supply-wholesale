import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuyerById, getBuyerCart, cartHoldSkus } from "@/lib/firestore/buyers";
import { listQuotesForBuyer } from "@/lib/firestore/quotes";
import { loadActiveHoldsBySku } from "@/lib/firestore/holds";
import { getActiveLotsForBuyer } from "@/lib/firestore/suggestedLots";
import { EmptyState } from "@/components/EmptyState";
import { ClientCartLimitsForm } from "@/components/ClientCartLimitsForm";
import { Placeholder } from "@/components/Placeholder";
import { money, fullDate } from "@/lib/format";
import { saveBuyerCartLimits } from "@/lib/actions/buyer-cart-limits";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
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

  const [quotes, cart, lots] = await Promise.all([
    listQuotesForBuyer(buyer.username, 20),
    getBuyerCart(buyer.id),
    getActiveLotsForBuyer(buyer.username),
  ]);
  const holdSkus = cartHoldSkus(cart);
  const holds = await loadActiveHoldsBySku(holdSkus);
  const cartTotal = cart.reduce((s, i) => s + i.price, 0);

  return (
    <div className="px-10 pb-12 pt-8">
      <Link
        href="/wholesaleportal/rep/clients"
        className="text-[12px] text-muted transition hover:text-ink"
      >
        ‹ Back to clients
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-4">
        <h1 className="text-[24px] font-semibold text-ink">
          {buyer.displayName || `@${buyer.username}`}
        </h1>
        <span className="font-mono text-[11px] text-muted">@{buyer.username}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          {buyer.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              RECENT INVOICE REQUESTS
            </div>
            {quotes.length === 0 ? (
              <p className="text-[12.5px] text-muted">
                No invoice requests from this buyer yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-chip border border-border">
                <div className="grid grid-cols-[1fr_80px_100px_110px] border-b border-border bg-ground px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <span>Submitted</span>
                  <span className="text-center">Items</span>
                  <span className="text-right">Total</span>
                  <span>Status</span>
                </div>
                {quotes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/wholesaleportal/rep/quotes/${q.id}`}
                    className="grid grid-cols-[1fr_80px_100px_110px] items-center border-b border-border/60 px-4 py-3 text-[12.5px] transition last:border-b-0 hover:bg-ground"
                  >
                    <span className="font-mono text-[11px] text-muted">
                      {fullDate(q.createdAt)}
                    </span>
                    <span className="text-center font-mono">{q.itemCount}</span>
                    <span className="text-right font-mono">
                      {q.cartTotal != null ? money(Math.round(q.cartTotal)) : "—"}
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
                      {q.status}
                    </span>
                  </Link>
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
                        <div>
                          <div className="text-ink">{item.title}</div>
                          <div className="font-mono text-[11px] text-muted">
                            {item.isSuggestedLot
                              ? `Suggested lot · ${lotSkus.length || item.lotItems?.length || 0} SKUs`
                              : item.sku}
                            {hold?.heldUntil
                              ? ` · held until ${new Date(hold.heldUntil).toLocaleString()}`
                              : ""}
                          </div>
                          {item.isSuggestedLot && (item.lotItems || []).length > 0 ? (
                            <ul className="mt-1 space-y-0.5">
                              {(item.lotItems || []).map((li, liIdx) => (
                                <li
                                  key={`${item.lotId || item.sku}-${li.sku}-${liIdx}`}
                                  className="font-mono text-[10.5px] text-muted"
                                >
                                  {li.sku}
                                  {li.title ? ` · ${li.title}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <span className="font-mono">{money(item.price)}</span>
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
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lot.items.map((it, i) => (
                        <Placeholder
                          key={`${lot.id}-${it.sku}-${i}`}
                          imageSrc={it.imageUrl || it.imageUrls?.[0] || null}
                          label={it.sku}
                          className="h-12 w-12 items-end rounded border border-border pb-0.5 text-[7px]"
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
            <div className="space-y-2 text-[12.5px]">
              <Row label="Created" value={fullDate(buyer.createdAt)} />
              <Row label="Last login" value={fullDate(buyer.lastLoginAt)} />
              <Row label="Status" value={buyer.status} />
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              ORDER HOLD LIMITS
            </div>
            <ClientCartLimitsForm
              action={saveBuyerCartLimits}
              buyerId={buyer.id}
              maxCartItems={buyer.maxCartItems}
              maxCartValue={buyer.maxCartValue}
            />
          </div>

          {quotes.length === 0 && cart.length === 0 ? (
            <EmptyState
              title="No activity yet."
              hint="This buyer hasn't started an order or submitted an invoice request."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
