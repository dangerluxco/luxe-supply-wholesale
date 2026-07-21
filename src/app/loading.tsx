import { BrandedLoader } from "@/components/BrandedLoader";

/** Root fallback — covers standalone routes (curation viewer, fulfillment, sign-in). */
export default function RootLoading() {
  return <BrandedLoader fullScreen />;
}
