import { NextResponse } from "next/server";
import { getStorefrontAvailabilitySnapshot } from "@/lib/firestore/suggestedLots";

export const dynamic = "force-dynamic";

/** Lightweight poll endpoint so open buyer tabs can drop bundled SKUs without a full refresh. */
export async function GET() {
  try {
    const snapshot = await getStorefrontAvailabilitySnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.warn(
      "[api/bundled-skus] unavailable:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ skus: [], revision: "error" }, { status: 200 });
  }
}
