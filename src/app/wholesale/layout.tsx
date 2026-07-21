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
  let index: { sku: string; name: string; era: string; material: string }[] = [];
  try {
    index = await getCatalogSearchIndex();
  } catch (err) {
    console.warn("[wholesale layout] catalog index unavailable:", err instanceof Error ? err.message : err);
  }

  // Staff or invalid cookie → guest chrome (no Firestore staff lookup hang)
  if (!decoded || decoded.role !== ROLE.BUYER) {
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

  const session = await getSession();
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

  let cartCount = 0;
  let cartTotal = 0;
  try {
    const cart = await getBuyerCart(session.id);
    cartCount = cart.length;
    cartTotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  } catch (err) {
    console.warn("[wholesale layout] cart unavailable:", err instanceof Error ? err.message : err);
  }

  let wishlistCount = 0;
  try {
    wishlistCount = session.username ? (await listHoldAlertsForBuyer(session.username)).length : 0;
  } catch (err) {
    console.warn("[wholesale layout] wishlist unavailable:", err instanceof Error ? err.message : err);
  }

  return (
    <StorefrontAvailabilityProvider>
      <CartBadgeProvider cartCount={cartCount} cartTotal={cartTotal}>
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
