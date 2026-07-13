import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getBuyerCart } from "@/lib/firestore/buyers";
import { money } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { SubmitQuoteButton } from "@/components/SubmitQuoteButton";
import { RemoveCartItemButton } from "@/components/RemoveCartItemButton";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const cart = await getBuyerCart(session.id);
  const total = cart.reduce((s, i) => s + i.price, 0);

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Your order</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Soft holds · ~30 minutes · submit a quote request to the LuxeSupply team
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
            {cart.map((item) => (
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
                </div>
                <div className="font-mono text-[13px]">{money(item.price)}</div>
                <RemoveCartItemButton sku={item.sku} />
              </div>
            ))}
          </div>

          <div className="h-fit rounded-card border border-border bg-surface p-5">
            <div className="flex justify-between text-[13px]">
              <span className="text-secondary">Subtotal</span>
              <span className="font-mono font-semibold">{money(total)}</span>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Checkout creates a quote request for staff (same as the previous storefront). Net-30 invoices come next.
            </p>
            <div className="mt-5">
              <SubmitQuoteButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
