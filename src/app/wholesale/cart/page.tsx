import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { cartHoldSkus, getBuyerCart } from "@/lib/firestore/buyers";
import { loadActiveHoldsBySku } from "@/lib/firestore/holds";
import { getQuoteThresholds, evaluateQuoteThresholds } from "@/lib/firestore/settings";
import { money } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { SubmitInvoiceRequestButton } from "@/components/SubmitInvoiceRequestButton";
import { RemoveCartItemButton } from "@/components/RemoveCartItemButton";
import { HoldCountdown } from "@/components/HoldCountdown";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const cart = await getBuyerCart(session.id);
  const total = cart.reduce((s, i) => s + i.price, 0);
  const holdSkus = cartHoldSkus(cart);
  const holds = await loadActiveHoldsBySku(holdSkus);
  const me = (session.username || "").toLowerCase();

  const thresholds = await getQuoteThresholds();
  const thresholdCheck = evaluateQuoteThresholds(thresholds, {
    itemCount: cart.length,
    cartTotal: total,
    pricedItemCount: cart.length,
  });

  // Earliest active hold expiry for this buyer's cart SKUs
  let earliestHoldUntil: string | null = null;
  for (const sku of holdSkus) {
    const h = holds.get(sku);
    if (!h?.heldUntil) continue;
    if (h.portalUsername !== me) continue;
    if (!earliestHoldUntil || h.heldUntil < earliestHoldUntil) {
      earliestHoldUntil = h.heldUntil;
    }
  }

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Your order</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Soft holds · ~30 minutes · submit for processing to invoice with the LuxeSupply team
        {earliestHoldUntil ? (
          <>
            {" · "}
            <HoldCountdown expiresAt={earliestHoldUntil} />
          </>
        ) : null}
      </p>

      {cart.length === 0 ? (
        <EmptyState
          title="Nothing in your order yet."
          hint="Browse the collection and add one-of-one pieces."
          className="mt-8"
        />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {cart.map((item) => {
              const lineSkus = item.isSuggestedLot
                ? (item.lotItems || []).map((li) => li.sku).filter(Boolean)
                : [item.sku];
              const lineHold = lineSkus
                .map((s) => holds.get(s))
                .find((h) => h && h.portalUsername === me);
              return (
                <div
                  key={item.sku}
                  className="flex items-center gap-4 border-b border-border/60 px-5 py-4 last:border-b-0"
                >
                  <div className="h-16 w-16 overflow-hidden rounded-chip bg-ground">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-ink">{item.title}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {item.isSuggestedLot
                        ? `Suggested lot · ${(item.lotItems || []).length} SKUs`
                        : item.sku}
                    </div>
                    {lineHold?.heldUntil ? (
                      <div className="mt-1 text-[11px] text-secondary">
                        Soft hold · <HoldCountdown expiresAt={lineHold.heldUntil} />
                      </div>
                    ) : null}
                  </div>
                  <div className="font-mono text-[13px]">{money(item.price)}</div>
                  <RemoveCartItemButton sku={item.sku} />
                </div>
              );
            })}
          </div>

          <div className="h-fit rounded-card border border-border bg-surface p-5">
            <div className="flex justify-between text-[13px]">
              <span className="text-secondary">Subtotal</span>
              <span className="font-mono font-semibold">{money(total)}</span>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Checkout submits your order for processing to invoice. Soft holds become 48-hour
              processing holds when you submit.
            </p>
            {!thresholdCheck.met ? (
              <p className="mt-3 rounded-chip border border-accent/40 bg-accent/5 px-3 py-2 text-[11.5px] text-secondary">
                {thresholdCheck.message}
              </p>
            ) : null}
            <div className="mt-5">
              <SubmitInvoiceRequestButton disabled={!thresholdCheck.met} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
