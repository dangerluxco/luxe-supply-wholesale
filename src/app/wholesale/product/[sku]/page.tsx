import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { findSimilarCatalogItems, getCatalogProductBySku } from "@/lib/firestore/catalog";
import { getProductOverrides, type ProductOverrides } from "@/lib/firestore/productOverrides";
import { cartHoldSkus, getBuyerCart } from "@/lib/firestore/buyers";
import { Placeholder } from "@/components/Placeholder";
import { getSession } from "@/lib/auth";
import { ROLE, PRODUCT_STATUS } from "@/lib/constants";
import { ProductPdpGallery } from "@/components/ProductPdpGallery";
import { money } from "@/lib/format";
import { favorableCompLine } from "@/lib/pricing";
import { AddToOrderButton } from "@/components/AddToOrderButton";
import { RequestPieceCallButton } from "@/components/RequestPieceCallButton";
import { BackButton } from "@/components/BackButton";
import { HoldAlertButton } from "@/components/HoldAlertButton";
import { LiveBundledSkuGuard } from "@/components/StorefrontAvailability";
import { getHoldAlertForBuyerSku } from "@/lib/firestore/holdAlerts";

export const dynamic = "force-dynamic";

/**
 * Streams after the shell: "similar pieces" scored by brand/material/era/price
 * (lib/recommend.ts) — the same engine staff already use on order requests, now
 * finally surfaced to the buyer who's actually shopping. Excludes cart items.
 */
async function SimilarPiecesSlot({
  sku,
  cartSkus,
  pricesVisible,
}: {
  sku: string;
  cartSkus: string[];
  pricesVisible: boolean;
}) {
  const similar = await findSimilarCatalogItems(sku, cartSkus, 4).catch(() => []);
  if (!similar.length) return null;
  return (
    <div className="mt-14">
      <h2 className="mb-4 text-[16px] font-semibold tracking-tight text-ink">Similar pieces</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {similar.map((item) => (
          <Link
            key={item.sku}
            href={`/wholesale/product/${encodeURIComponent(item.sku)}`}
            className="group overflow-hidden rounded-card border border-border bg-surface transition hover:border-accent"
          >
            <Placeholder
              imageSrc={item.imageUrl}
              alt={item.title}
              className="aspect-square w-full"
            />
            <div className="space-y-1 px-3 py-3">
              <div className="line-clamp-2 text-[12.5px] font-medium text-ink">{item.title}</div>
              <div className="flex items-baseline justify-between gap-2">
                {pricesVisible && item.price != null ? (
                  <span className="font-mono text-[12.5px] text-ink">
                    {money(Math.round(item.price))}
                  </span>
                ) : (
                  <span />
                )}
                <span className="font-mono text-[10px] text-muted">{item.match}% match</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Streams after the main PDP shell so hold-alert lookup never blocks first paint. */
async function HoldAlertSlot({
  sku,
  buyerUsername,
}: {
  sku: string;
  buyerUsername: string;
}) {
  const active = await getHoldAlertForBuyerSku(buyerUsername, sku);
  return <HoldAlertButton sku={sku} active={active} />;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const decodedSku = decodeURIComponent(sku);

  // Session is React.cache'd with the buyer layout — no double Firestore hit.
  const session = await getSession();
  const pricesVisible = !!session && session.role === ROLE.BUYER;
  const buyerUsername = pricesVisible ? session?.username : null;

  let product: Awaited<ReturnType<typeof getCatalogProductBySku>> = null;
  let cartSkus: string[] = [];
  let details: ProductOverrides | null = null;
  try {
    const [productResult, cartResult, detailsResult] = await Promise.all([
      getCatalogProductBySku(decodedSku, {
        buyerUsername,
      }),
      pricesVisible && session?.id ? getBuyerCart(session.id).catch(() => []) : Promise.resolve([]),
      // Staff-entered details (description, provenance, marks, dimensions…) —
      // captured on the product edit page but previously never shown to buyers.
      getProductOverrides(decodedSku).catch(() => null),
    ]);
    product = productResult;
    cartSkus = cartHoldSkus(cartResult);
    details = detailsResult;
  } catch (err) {
    console.warn("[wholesale product] Firestore unavailable:", err instanceof Error ? err.message : err);
  }
  if (!product || product.soldOut) notFound();

  const detailRows: Array<[string, string]> = details
    ? (
        [
          ["Category", details.category],
          ["Origin", details.origin],
          ["Dimensions", details.dimensions],
          ["Marks", details.marks],
          ["Provenance", details.provenance],
        ] as Array<[string, string | null]>
      )
        .filter((r): r is [string, string] => !!r[1] && r[1].trim() !== "")
    : [];

  const price = Math.round(product.price ?? 0);
  const unavailable = product.held || product.price == null;
  const inCart = cartSkus.some((s) => s.toUpperCase() === product!.sku.toUpperCase());

  return (
    <div className="px-8 pb-16 pt-6">
      <LiveBundledSkuGuard sku={product.sku} />
      <div className="mb-6 flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        <BackButton fallbackHref="/wholesale" label="Back" />
        <span className="text-border">|</span>
        <span>
          <Link href="/wholesale" className="hover:text-ink">
            Collection
          </Link>
          <span className="mx-2">/</span>
          <span>{product.sku}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-12">
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
              {(() => {
                const compLine = favorableCompLine(product.price, product.hostCompAvgUsd);
                return compLine ? (
                  <div className="mt-1 font-mono text-[12px] text-[#4E9A6A]">{compLine}</div>
                ) : null;
              })()}
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

          {details?.description ? (
            <p className="mt-4 max-w-prose whitespace-pre-wrap text-[13px] leading-relaxed text-secondary">
              {details.description}
            </p>
          ) : null}

          {detailRows.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-card border border-border">
              {detailRows.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[110px_1fr] gap-3 border-b border-border/60 bg-surface px-4 py-2.5 text-[12.5px] last:border-b-0"
                >
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
                    {label}
                  </span>
                  <span className="whitespace-pre-wrap text-ink">{value}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-8 space-y-3">
            {pricesVisible ? (
              <>
                <AddToOrderButton
                  sku={product.sku}
                  price={price}
                  disabled={unavailable}
                  inCart={inCart}
                  pendingRequest={product.pendingRequest}
                />
                <RequestPieceCallButton
                  sku={product.sku}
                  title={product.title}
                  imageUrls={[product.imageUrls?.[0] || product.imageUrl]}
                />
              </>
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
              {pricesVisible && buyerUsername ? (
                <div className="mt-3">
                  <Suspense
                    fallback={
                      <div
                        className="h-11 w-full animate-pulse rounded-chip border border-border bg-border/40"
                        aria-hidden
                      />
                    }
                  >
                    <HoldAlertSlot sku={product.sku} buyerUsername={buyerUsername} />
                  </Suspense>
                </div>
              ) : null}
            </>
          ) : product.pendingRequest ? (
            <p className="mt-3 text-[12px] text-muted">
              On your pending invoice request — held for you
              {product.heldUntil
                ? ` until ${new Date(product.heldUntil).toLocaleString()}`
                : ""}
              .
            </p>
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

      <Suspense fallback={null}>
        <SimilarPiecesSlot
          sku={product.sku}
          cartSkus={cartSkus}
          pricesVisible={pricesVisible}
        />
      </Suspense>
    </div>
  );
}
