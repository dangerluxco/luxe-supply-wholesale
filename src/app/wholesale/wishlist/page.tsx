import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listHoldAlertsForBuyer } from "@/lib/firestore/holdAlerts";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import { EmptyState } from "@/components/EmptyState";
import { HoldAlertButton } from "@/components/HoldAlertButton";
import { AddToOrderButton } from "@/components/AddToOrderButton";
import { Placeholder } from "@/components/Placeholder";
import { fullDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const COL = {
  image: "w-14",
  item: "min-w-0 flex-1",
  sku: "w-[130px] shrink-0",
  status: "w-[150px] shrink-0",
  date: "w-[110px] shrink-0",
  actions: "w-[220px] shrink-0",
};

export default async function WishlistPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const alerts = session.username ? await listHoldAlertsForBuyer(session.username) : [];

  const rows = await Promise.all(
    alerts.map(async (a) => {
      let product: Awaited<ReturnType<typeof getCatalogProductBySku>> = null;
      try {
        product = await getCatalogProductBySku(a.sku, {
          buyerUsername: session.username,
          includeBundled: true,
        });
      } catch {
        product = null;
      }
      return { alert: a, product };
    }),
  );

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Wishlist</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Pieces you&apos;re tracking — we&apos;ll keep them here so you know the moment they free up.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="No wishlist items yet."
          hint="On a held piece's card or page, choose “Add to wishlist” / “Notify me when available.”"
          className="mt-8"
        />
      ) : (
        <div className="mt-8 overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[760px]">
          <div className="flex items-center gap-4 border-b border-border bg-ground px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            <span className={COL.image} />
            <span className={COL.item}>Item</span>
            <span className={COL.sku}>SKU</span>
            <span className={COL.status}>Status</span>
            <span className={COL.date}>Date added</span>
            <span className={COL.actions} />
          </div>

          {rows.map(({ alert, product }) => {
            const gone = !product;
            const soldOut = !!product?.soldOut;
            const held = gone ? false : !!product?.held;
            const available = !gone && !soldOut && !held;

            const statusLabel = gone
              ? "No longer listed"
              : soldOut
                ? "Sold"
                : held
                  ? "Still on hold"
                  : "Available";
            const statusColor = gone || soldOut ? "#8B897F" : held ? "#B08D3E" : "#4E9A6A";

            return (
              <div
                key={alert.id}
                className="flex items-center gap-4 border-b border-border/60 px-5 py-4 last:border-b-0"
              >
                <Placeholder
                  imageSrc={product?.imageUrl || null}
                  alt={product?.title || alert.title}
                  className={COL.image + " aspect-square rounded-chip"}
                />
                <div className={COL.item}>
                  <Link
                    href={`/wholesale/product/${alert.sku}`}
                    className="block truncate font-semibold text-ink hover:text-accent hover:underline"
                  >
                    {product?.title || alert.title}
                  </Link>
                  <div className="truncate text-[11px] text-muted">
                    {product?.brand || alert.brand || "—"}
                  </div>
                </div>
                <div className={COL.sku + " font-mono text-[11px] text-muted"}>{alert.sku}</div>
                <div className={COL.status + " flex items-center gap-1.5 text-[11.5px] text-secondary"}>
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: statusColor }}
                  />
                  {statusLabel}
                </div>
                <div className={COL.date + " text-[11.5px] text-muted"}>{fullDate(alert.createdAt)}</div>
                <div className={COL.actions + " flex flex-col items-end gap-1.5"}>
                  {available && product?.price != null ? (
                    <AddToOrderButton sku={alert.sku} price={Math.round(product.price)} />
                  ) : null}
                  <HoldAlertButton sku={alert.sku} active />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
