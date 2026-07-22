import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DEFAULT_MAX_CART_ITEMS, DEFAULT_MAX_CART_VALUE, ROLE } from "@/lib/constants";
import { cartHoldSkus, getBuyerById, getBuyerCart } from "@/lib/firestore/buyers";
import { loadActiveHoldsBySku } from "@/lib/firestore/holds";
import { getQuoteThresholds, evaluateQuoteThresholds } from "@/lib/firestore/settings";
import { money } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { CartCheckoutPanel } from "@/components/CartCheckoutPanel";
import { RemoveCartItemButton } from "@/components/RemoveCartItemButton";
import { HoldCountdown } from "@/components/HoldCountdown";
import { InfoTip } from "@/components/InfoTip";
import { RequestPieceCallButton } from "@/components/RequestPieceCallButton";
import { MicroBadge } from "@/components/badges";
import { BundleImageStrip } from "@/components/BundleImageStrip";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const [cart, buyer, thresholds] = await Promise.all([
    getBuyerCart(session.id),
    getBuyerById(session.id),
    getQuoteThresholds(),
  ]);
  const total = cart.reduce((s, i) => s + i.price, 0);
  const holdSkus = cartHoldSkus(cart);
  const holds = holdSkus.length ? await loadActiveHoldsBySku(holdSkus) : new Map();
  const me = (session.username || "").toLowerCase();

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

  const maxItems = buyer?.maxCartItems ?? DEFAULT_MAX_CART_ITEMS;
  const maxValue = buyer?.maxCartValue ?? DEFAULT_MAX_CART_VALUE;

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="flex items-center gap-2 text-[24px] font-semibold text-ink">
        Your order
        <InfoTip label="Cart vs invoice-request holds">
          Soft holds last 7 days while pieces stay in your cart. When you submit for review,
          holds continue for up to 7 days while staff reviews. Generating an invoice marks
          pieces sold; if staff remove a line or the request times out, those items go back on
          the store.
        </InfoTip>
      </h1>
      <p className="mt-1 text-[13px] text-secondary">
        Soft holds · 7 days in cart · then up to 7 days after you submit
        {earliestHoldUntil ? (
          <>
            {" · "}
            <HoldCountdown expiresAt={earliestHoldUntil} />
          </>
        ) : null}
      </p>
      <p className="mt-1 text-[12px] text-muted">
        Limit: up to {maxItems} items / {money(maxValue)} while on hold
      </p>

      {cart.length === 0 ? (
        <EmptyState
          title="Nothing in your order yet."
          hint="Browse the collection and add one-of-one pieces."
          className="mt-8"
        />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {cart.map((item, index) => {
              const lineSkus = item.isSuggestedLot
                ? (item.lotItems || []).map((li) => li.sku).filter(Boolean)
                : [item.sku];
              const lineHold = lineSkus
                .map((s) => holds.get(s))
                .find((h) => h && h.portalUsername === me);
              const lotImages = item.isSuggestedLot
                ? (item.lotItems || []).map((li) => li.imageUrl).filter(Boolean)
                : [];
              return (
                <div
                  key={`${item.sku}-${index}`}
                  className="flex items-center gap-4 border-b border-border/60 px-5 py-4 last:border-b-0"
                >
                  {item.isSuggestedLot ? (
                    <BundleImageStrip
                      images={lotImages.length ? lotImages : [item.imageUrl]}
                      size="md"
                    />
                  ) : (
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-chip bg-ground">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt="" fill sizes="96px" className="object-cover" />
                      ) : null}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {item.isSuggestedLot ? (
                        <MicroBadge tone="solid-gold">BUNDLE</MicroBadge>
                      ) : null}
                      <div className="font-semibold text-ink">{item.title}</div>
                    </div>
                    <div className="font-mono text-[11px] text-muted">
                      {item.isSuggestedLot
                        ? `${(item.lotItems || []).length} pieces in this bundle`
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

          <div className="space-y-3">
            {!thresholdCheck.met ? (
              <p className="rounded-chip border border-accent/40 bg-accent/5 px-3 py-2 text-[11.5px] text-secondary">
                {thresholdCheck.message}
              </p>
            ) : null}
            <CartCheckoutPanel subtotal={total} submitDisabled={!thresholdCheck.met} />
            <RequestPieceCallButton
              cart
              title={
                cart.length === 1 ? cart[0]!.title : `${cart.length} pieces in your order`
              }
              imageUrls={cart.map((i) => i.imageUrl)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
