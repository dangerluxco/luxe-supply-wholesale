import Link from "next/link";
import { getProductDetailView } from "@/lib/firestore/productDetails";
import { ProductEditForm } from "@/components/ProductEditForm";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku: skuParam } = await params;
  const sku = decodeURIComponent(skuParam);

  let product: Awaited<ReturnType<typeof getProductDetailView>> = null;
  let loadError: string | null = null;
  try {
    product = await getProductDetailView(sku);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load product.";
  }

  if (loadError || !product) {
    return (
      <div className="px-10 pb-12 pt-8">
        <Link href="/wholesaleportal/rep/catalog" className="text-[11px] text-muted hover:text-ink">
          ← Back to catalog
        </Link>
        <div className="mt-4 max-w-2xl">
          <EmptyState
            title={loadError || `SKU “${sku}” was not found.`}
            hint="Check the SKU or go back to the catalog to pick another item."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <ProductEditForm initial={product} backHref="/wholesaleportal/rep/catalog" />
    </div>
  );
}
