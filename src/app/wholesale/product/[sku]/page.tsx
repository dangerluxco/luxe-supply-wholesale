import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogProductBySku } from "@/lib/firestore/catalog";
import { getSession } from "@/lib/auth";
import { ROLE, PRODUCT_STATUS } from "@/lib/constants";
import { ProductPdpGallery } from "@/components/ProductPdpGallery";
import { money } from "@/lib/format";
import { AddToOrderButton } from "@/components/AddToOrderButton";
import { HoldAlertButton } from "@/components/HoldAlertButton";
import { getHoldAlertForBuyerSku } from "@/lib/firestore/holdAlerts";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const session = await getSession();
  const pricesVisible = !!session && session.role === ROLE.BUYER;
  const buyerUsername = pricesVisible ? session?.username : null;

  const { sku } = await params;
  let product: Awaited<ReturnType<typeof getCatalogProductBySku>> = null;
  try {
    product = await getCatalogProductBySku(decodeURIComponent(sku), {
      buyerUsername,
    });
  } catch (err) {
    console.warn("[wholesale product] Firestore unavailable:", err instanceof Error ? err.message : err);
  }
  if (!product || product.soldOut) notFound();

  const hasHoldAlert =
    pricesVisible && product.held && buyerUsername
      ? await getHoldAlertForBuyerSku(buyerUsername, product.sku)
      : false;

  const price = Math.round(product.price ?? 0);
  const unavailable = product.held || product.price == null;

  return (
    <div className="px-8 pb-16 pt-6">
      <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        <Link href="/wholesale" className="hover:text-ink">
          Collection
        </Link>
        <span className="mx-2">/</span>
        <span>{product.sku}</span>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <ProductPdpGallery
          title={product.title}
          sku={product.sku}
          imageUrls={product.imageUrls.length ? product.imageUrls : [product.imageUrl]}
        />

        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{product.sku}</div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">{product.title}</h1>
          <div className="mt-1 text-[13px] text-secondary">
            {[product.brand, product.era, product.material].filter((x) => x && x !== "—").join(" · ")}
          </div>

          {pricesVisible ? (
            <>
              <div className="mt-5 font-mono text-[22px] font-semibold text-ink">
                {product.price != null ? money(price) : "—"}
              </div>
              {product.hostCompAvgUsd != null ? (
                <div className="mt-1 font-mono text-[12px] text-muted">
                  Comp avg {money(Math.round(product.hostCompAvgUsd))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-card border border-border bg-surface px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                Wholesale pricing
              </div>
              <p className="mt-1 text-[13px] text-secondary">
                Sign in with your buyer account to see price and place a soft hold.
              </p>
            </div>
          )}

          <div className="mt-2 text-[12px] text-secondary">Condition · {product.condition}</div>

          <div className="mt-8">
            {pricesVisible ? (
              <AddToOrderButton sku={product.sku} price={price} disabled={unavailable} />
            ) : (
              <Link
                href={`/wholesale/sign-in?next=${encodeURIComponent(`/wholesale/product/${product.sku}`)}`}
                className="flex h-[50px] items-center justify-center rounded-chip bg-ink text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90"
              >
                Sign in to see price &amp; order
              </Link>
            )}
          </div>

          {product.held ? (
            <>
              <p className="mt-3 text-[12px] text-muted">
                Status: {PRODUCT_STATUS.ON_HOLD} — soft-held by another buyer.
              </p>
              {pricesVisible ? (
                <div className="mt-3">
                  <HoldAlertButton sku={product.sku} active={hasHoldAlert} />
                </div>
              ) : null}
            </>
          ) : product.heldByYou ? (
            <p className="mt-3 text-[12px] text-muted">
              Soft-held for you
              {product.heldUntil
                ? ` until ${new Date(product.heldUntil).toLocaleString()}`
                : ""}
              .
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
