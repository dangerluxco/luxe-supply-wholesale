import { BrandedLoader } from "@/components/BrandedLoader";

/** Streams under the buyer topbar while a storefront page's catalog/cart fetches resolve. */
export default function WholesaleLoading() {
  return <BrandedLoader />;
}
