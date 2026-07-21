import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSession, decodeSession, areaSessionFrom, SESSION_COOKIE } from "@/lib/auth";
import { BuyerTopbar } from "@/components/BuyerTopbar";
import { CartBadgeProvider } from "@/components/CartBadgeProvider";
import { StorefrontAvailabilityProvider } from "@/components/StorefrontAvailability";
import { ROLE } from "@/lib/constants";
import { getBuyerCart } from "@/lib/firestore/buyers";
import { getCatalogSearchIndex } from "@/lib/catalogIndexCache";
import { listHoldAlertsForBuyer } from "@/lib/firestore/holdAlerts";

/** Buyer-facing tab title — overrides the root "Wholesale Portal" default for /wholesale/**. */
export const metadata: Metadata = {
  title: "Luxe Supply Co. — Wholesale Storefront",
};

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const decoded = decodeSession(areaSessionFrom(store.get(SESSION_COOKIE)?.value, "buyer"));

  // Lightweight catalog index for search (guest + buyer) — served from a 60s
  // in-process cache so this layout doesn't hydrate 400 products from Firestore
  // on every page view. Never let a transient hiccup take down browsing.
  const indexPromise = getCatalogSearchIndex().catch((err) => {
    console.warn(
      "[wholesale layout] catalog index unavailable:",
      err instanceof Error ? err.message : err,
    );
    return [] as { sku: string; name: string; era: string; material: string }[];
  });

  // Staff or invalid cookie → guest chrome (no Firestore staff lookup hang)
  if (!decoded || decoded.role !== ROLE.BUYER) {
    const index = await indexPromise;
    return (
      <StorefrontAvailabilityProvider>
        <CartBadgeProvider cartCount={0} cartTotal={0}>
          <div className="min-h-screen bg-ground">
            <BuyerTopbar user={null} index={index} />
            {children}
          </div>
        </CartBadgeProvider>
      </StorefrontAvailabilityProvider>
    );
  }

  // Session lookup overlaps the (usually cached) search index fetch.
  const [index, session] = await Promise.all([indexPromise, getSession()]);
  if (!session || session.role !== ROLE.BUYER) {
    return (
      <StorefrontAvailabilityProvider>
        <CartBadgeProvider cartCount={0} cartTotal={0}>
          <div className="min-h-screen bg-ground">
            <BuyerTopbar user={null} index={index} />
            {children}
          </div>
        </CartBadgeProvider>
      </StorefrontAvailabilityProvider>
    );
  }

  const [cartResult, wishlistCount] = await Promise.all([
    getBuyerCart(session.id)
      .then((cart) => ({
        cartCount: cart.length,
        cartTotal: cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0),
      }))
      .catch((err) => {
        console.warn(
          "[wholesale layout] cart unavailable:",
          err instanceof Error ? err.message : err,
        );
        return { cartCount: 0, cartTotal: 0 };
      }),
    session.username
      ? listHoldAlertsForBuyer(session.username)
          .then((alerts) => alerts.length)
          .catch((err) => {
            console.warn(
              "[wholesale layout] wishlist unavailable:",
              err instanceof Error ? err.message : err,
            );
            return 0;
          })
      : Promise.resolve(0),
  ]);

  return (
    <StorefrontAvailabilityProvider>
      <CartBadgeProvider cartCount={cartResult.cartCount} cartTotal={cartResult.cartTotal}>
        <div className="min-h-screen bg-ground">
          <BuyerTopbar
            user={{ name: session.name, initials: session.initials }}
            wishlistCount={wishlistCount}
            index={index}
          />
          {children}
        </div>
      </CartBadgeProvider>
    </StorefrontAvailabilityProvider>
  );
}
