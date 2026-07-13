import Link from "next/link";
import { notFound } from "next/navigation";
import { getBuyerById, getBuyerCart, cartHoldSkus } from "@/lib/firestore/buyers";
import { listQuotesForBuyer } from "@/lib/firestore/quotes";
import { loadActiveHoldsBySku } from "@/lib/firestore/holds";
import { EmptyState } from "@/components/EmptyState";
import { money, fullDate } from "@/lib/format";

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

  const [quotes, cart] = await Promise.all([
    listQuotesForBuyer(buyer.username, 20),
    getBuyerCart(buyer.id),
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
                  {cart.map((item) => {
                    const hold = holds.get(item.sku);
                    return (
                      <div
                        key={item.sku}
                        className="flex items-center justify-between gap-3 text-[12.5px]"
                      >
                        <div>
                          <div className="text-ink">{item.title}</div>
                          <div className="font-mono text-[11px] text-muted">
                            {item.sku}
                            {hold?.heldUntil
                              ? ` · held until ${new Date(hold.heldUntil).toLocaleString()}`
                              : ""}
                          </div>
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
