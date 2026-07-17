import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSession, decodeSession, areaSessionFrom, SESSION_COOKIE } from "@/lib/auth";
import { BuyerTopbar } from "@/components/BuyerTopbar";
import { StorefrontAvailabilityProvider } from "@/components/StorefrontAvailability";
import { ROLE } from "@/lib/constants";
import { getBuyerCart } from "@/lib/firestore/buyers";
import { listCatalogProducts } from "@/lib/firestore/catalog";

/** Buyer-facing tab title — overrides the root "Wholesale Portal" default for /wholesale/**. */
export const metadata: Metadata = {
  title: "Luxe Supply Co. — Wholesale Storefront",
};

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const decoded = decodeSession(areaSessionFrom(store.get(SESSION_COOKIE)?.value, "buyer"));

  // Always load a lightweight catalog index for search (guest + buyer).
  // Never let a transient Firestore hiccup take down sign-in/browsing entirely.
  let index: { sku: string; name: string; era: string; material: string }[] = [];
  try {
    const { products } = await listCatalogProducts(400);
    index = products
      .filter((p) => !p.soldOut)
      .map((p) => ({
        sku: p.sku,
        name: p.title,
        era: p.era,
        material: p.material,
      }));
  } catch (err) {
    console.warn("[wholesale layout] catalog index unavailable:", err instanceof Error ? err.message : err);
  }

  // Staff or invalid cookie → guest chrome (no Firestore staff lookup hang)
  if (!decoded || decoded.role !== ROLE.BUYER) {
    return (
      <StorefrontAvailabilityProvider>
        <div className="min-h-screen bg-ground">
          <BuyerTopbar user={null} cartCount={0} index={index} />
          {children}
        </div>
      </StorefrontAvailabilityProvider>
    );
  }

  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) {
    return (
      <StorefrontAvailabilityProvider>
        <div className="min-h-screen bg-ground">
          <BuyerTopbar user={null} cartCount={0} index={index} />
          {children}
        </div>
      </StorefrontAvailabilityProvider>
    );
  }

  let cartCount = 0;
  try {
    cartCount = (await getBuyerCart(session.id)).length;
  } catch (err) {
    console.warn("[wholesale layout] cart unavailable:", err instanceof Error ? err.message : err);
  }

  return (
    <StorefrontAvailabilityProvider>
      <div className="min-h-screen bg-ground">
        <BuyerTopbar
          user={{ name: session.name, initials: session.initials }}
          cartCount={cartCount}
          index={index}
        />
        {children}
      </div>
    </StorefrontAvailabilityProvider>
  );
}
