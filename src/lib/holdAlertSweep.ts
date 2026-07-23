import { listHoldAlertsForStaff, markHoldAlertNotified } from "@/lib/firestore/holdAlerts";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import { sendBackInStockEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";

export type HoldAlertSweepResult = {
  checked: number;
  /** Alerts whose piece is available right now (not sold, not held). */
  available: number;
  notified: string[];
  /** Email not configured — eligible alerts left un-notified for the staff Notify button. */
  skippedEmailUnconfigured: number;
};

/**
 * Automated "it's available again" pass, run from the daily cron. Previously
 * buyers were only notified if a staff member happened to notice a freed-up
 * piece and clicked Notify — wishlisted demand silently expired otherwise.
 *
 * Same safety rails as the manual route: availability is re-checked against the
 * live catalog immediately before sending, only un-notified alerts with a buyer
 * email are considered, and each alert is stamped so it never double-sends.
 */
export async function notifyAvailableHoldAlerts(): Promise<HoldAlertSweepResult> {
  const alerts = await listHoldAlertsForStaff(200);
  const pending = alerts.filter((a) => !a.notifiedAt && a.buyerEmail && a.sku);

  const result: HoldAlertSweepResult = {
    checked: pending.length,
    available: 0,
    notified: [],
    skippedEmailUnconfigured: 0,
  };
  if (!pending.length) return result;

  const products = await getCatalogProductsBySkus([...new Set(pending.map((a) => a.sku))]);

  for (const alert of pending) {
    const product = products.get(alert.sku) || products.get(alert.sku.toUpperCase());
    if (!product || product.soldOut || product.held) continue;
    result.available += 1;

    if (!isEmailConfigured()) {
      // Don't stamp notifiedAt — the wishlist page's manual Notify button (or a
      // future run once RESEND_API_KEY is set) still owes this buyer an email.
      result.skippedEmailUnconfigured += 1;
      continue;
    }

    try {
      const sent = await sendBackInStockEmail({
        customerName: alert.buyerDisplayName,
        customerEmail: alert.buyerEmail,
        sku: alert.sku,
        title: alert.title,
        brand: alert.brand || undefined,
      });
      if (sent) {
        await markHoldAlertNotified(alert.id, "cron:auto");
        result.notified.push(`${alert.portalUsername || alert.buyerEmail} · ${alert.sku}`);
      }
    } catch (err) {
      console.warn(
        `[holdAlertSweep] notify failed for ${alert.sku}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}
