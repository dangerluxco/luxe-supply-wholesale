import { NextRequest, NextResponse } from "next/server";
import {
  BUNDLE_AUTO_EXPIRE_DAYS,
  INVOICE_REQUEST_TIMEOUT_DAYS,
} from "@/lib/constants";
import { expireStaleSuggestedLots } from "@/lib/firestore/suggestedLots";
import { expireStaleInvoiceRequests } from "@/lib/firestore/quotes";
import { notifyAvailableHoldAlerts } from "@/lib/holdAlertSweep";

/**
 * Daily maintenance:
 * - Archive suggested lots older than 14 days (SKUs return to catalog)
 * - Timeout invoice requests pending > 7 days (release holds, deactivate bundles in request)
 * - Email buyers whose wishlisted (hold-alert) pieces are available again —
 *   runs AFTER the two expiry passes so pieces they just freed up are included.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Cloud Scheduler job: luxe-expire-bundles → this route
 */
export async function POST(request: NextRequest) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const querySecret = request.nextUrl.searchParams.get("secret") || "";
  if (bearer !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [lots, requests] = await Promise.all([
      expireStaleSuggestedLots(BUNDLE_AUTO_EXPIRE_DAYS),
      expireStaleInvoiceRequests(INVOICE_REQUEST_TIMEOUT_DAYS),
    ]);

    // After expiries release holds / re-list lot SKUs, tell waiting buyers.
    const holdAlerts = await notifyAvailableHoldAlerts().catch((err) => {
      console.warn("[cron/expire-bundles] hold-alert sweep failed:", err);
      return null;
    });

    return NextResponse.json({
      ok: true,
      bundles: {
        maxAgeDays: BUNDLE_AUTO_EXPIRE_DAYS,
        checked: lots.checked,
        archived: lots.archived,
        archivedCount: lots.archived.length,
      },
      invoiceRequests: {
        maxAgeDays: INVOICE_REQUEST_TIMEOUT_DAYS,
        checked: requests.checked,
        timedOut: requests.timedOut,
        timedOutCount: requests.timedOut.length,
      },
      holdAlerts,
    });
  } catch (err) {
    console.error("[cron/expire-bundles]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Daily maintenance failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
