import { BrandedLoader } from "@/components/BrandedLoader";

/** Streams inside the sidebar layout while a staff page's Firestore fetches resolve. */
export default function RepLoading() {
  return <BrandedLoader />;
}
