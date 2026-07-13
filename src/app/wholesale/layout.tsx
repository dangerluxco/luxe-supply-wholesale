import { cookies } from "next/headers";
import { getSession, decodeSession, SESSION_COOKIE } from "@/lib/auth";
import { BuyerTopbar } from "@/components/BuyerTopbar";
import { ROLE } from "@/lib/constants";
import { getBuyerCart } from "@/lib/firestore/buyers";
import { listCatalogProducts } from "@/lib/firestore/catalog";

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);

  // Always load a lightweight catalog index for search (guest + buyer).
  const { products } = await listCatalogProducts(400);
  const index = products
    .filter((p) => !p.soldOut)
    .map((p) => ({
      sku: p.sku,
      name: p.title,
      era: p.era,
      material: p.material,
    }));

  // Staff or invalid cookie → guest chrome (no Firestore staff lookup hang)
  if (!decoded || decoded.role !== ROLE.BUYER) {
    return (
      <div className="min-h-screen bg-ground">
        <BuyerTopbar user={null} cartCount={0} index={index} />
        {children}
      </div>
    );
  }

  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) {
    return (
      <div className="min-h-screen bg-ground">
        <BuyerTopbar user={null} cartCount={0} index={index} />
        {children}
      </div>
    );
  }

  const cart = await getBuyerCart(session.id);

  return (
    <div className="min-h-screen bg-ground">
      <BuyerTopbar
        user={{ name: session.name, initials: session.initials }}
        cartCount={cart.length}
        index={index}
      />
      {children}
    </div>
  );
}
