import { NextResponse } from "next/server";
import { getPortalFeatures, type PortalFeatures } from "@/lib/firestore/settings";

const LABELS: Record<keyof PortalFeatures, string> = {
  leads: "Leads",
  wishlist: "Wishlist",
  performance: "Performance",
  curation: "Curate Order",
};

/** Soft-gate for staff APIs — 403 when the org feature flag is off. */
export async function featureDisabledResponse(
  key: keyof PortalFeatures,
): Promise<NextResponse | null> {
  const features = await getPortalFeatures();
  if (features[key]) return null;
  return NextResponse.json(
    { error: `${LABELS[key]} is disabled for this organization.` },
    { status: 403 },
  );
}

export async function isFeatureEnabled(key: keyof PortalFeatures): Promise<boolean> {
  const features = await getPortalFeatures();
  return features[key] !== false;
}
