import { redirect } from "next/navigation";
import { getPortalFeatures, type PortalFeatures } from "@/lib/firestore/settings";

/** Server pages: bounce to dashboard when the org feature flag is off. */
export async function requirePortalFeature(key: keyof PortalFeatures): Promise<void> {
  const features = await getPortalFeatures();
  if (!features[key]) {
    redirect("/wholesaleportal/rep/dashboard");
  }
}
