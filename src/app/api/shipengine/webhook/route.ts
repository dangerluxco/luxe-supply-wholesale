import { NextRequest, NextResponse } from "next/server";
import { updateTrackingStatusByNumber } from "@/lib/firestore/fulfillment";

export const dynamic = "force-dynamic";

/**
 * ShipEngine tracking webhook — updates the owning box's latest carrier
 * status ("In Transit", "Delivered", …). Register in the ShipEngine dashboard
 * as:  https://<host>/api/shipengine/webhook?secret=<SHIPENGINE_WEBHOOK_SECRET>
 * (ShipEngine doesn't sign payloads; the shared-secret query param is the gate.)
 */
export async function POST(request: NextRequest) {
  const expected = String(process.env.SHIPENGINE_WEBHOOK_SECRET || "").trim();
  if (!expected || request.nextUrl.searchParams.get("secret") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // v1 track events put the tracking payload under `data`; tolerate both shapes.
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<
    string,
    unknown
  >;
  const trackingNumber = String(data.tracking_number || "");
  const status = String(
    data.status_description || data.carrier_status_description || data.status_code || "",
  );

  if (trackingNumber && status) {
    const matched = await updateTrackingStatusByNumber(trackingNumber, status).catch(() => false);
    return NextResponse.json({ ok: true, matched });
  }
  return NextResponse.json({ ok: true, matched: false });
}
