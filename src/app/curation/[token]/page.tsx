import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { BrandedLoader } from "@/components/BrandedLoader";
import { CurationViewer } from "@/components/CurationViewer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function ViewerLoading() {
  return <BrandedLoader fullScreen />;
}

/**
 * Standalone, top-level route — deliberately NOT nested under /wholesale so it
 * does not inherit the buyer storefront layout (BuyerTopbar + its own logo/nav,
 * plus a Firestore catalog/cart load on every visit). This page is public
 * (token-gated), so middleware's matcher intentionally does not cover it.
 */
export default async function CurationSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <ClientOnly fallback={<ViewerLoading />}>
      <Suspense fallback={<ViewerLoading />}>
        <CurationViewer token={token} />
      </Suspense>
    </ClientOnly>
  );
}
