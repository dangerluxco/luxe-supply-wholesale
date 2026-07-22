import { listHoldAlertsForStaff } from "@/lib/firestore/holdAlerts";
import { getCatalogProductsBySkus } from "@/lib/firestore/catalog";
import { EmptyState } from "@/components/EmptyState";
import { NotifyBuyerButton } from "@/components/NotifyBuyerButton";
import { fullDate } from "@/lib/format";
import { requirePortalFeature } from "@/lib/require-feature";

export const dynamic = "force-dynamic";

export default async function StaffWishlistPage() {
  await requirePortalFeature("wishlist");
  const alerts = await listHoldAlertsForStaff();

  // Live availability per SKU + demand count (how many buyers wait on each piece).
  const skus = [...new Set(alerts.map((a) => a.sku))];
  const products = await getCatalogProductsBySkus(skus).catch(
    () => new Map<string, never>(),
  );
  const demandBySku = new Map<string, number>();
  for (const a of alerts) demandBySku.set(a.sku, (demandBySku.get(a.sku) || 0) + 1);

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Wishlist demand</h1>
        <span className="text-[12px] text-muted">
          Buyers waiting on held pieces — notify them the moment a piece frees up
        </span>
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          title="No active wishlist alerts."
          hint="Buyers can request a notification from a held piece's product page."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1.2fr_90px_1fr_120px_120px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Item</span>
            <span>Status</span>
            <span>Buyer</span>
            <span>Requested</span>
            <span className="text-right">Action</span>
          </div>
          {alerts.map((a) => {
            const product = products.get(a.sku);
            const gone = !product;
            const soldOut = !!product?.soldOut;
            const held = gone ? false : !!product?.held;
            const available = !gone && !soldOut && !held;
            const statusLabel = gone ? "Unlisted" : soldOut ? "Sold" : held ? "Held" : "Available";
            const statusColor = gone || soldOut ? "#8B897F" : held ? "#B08D3E" : "#4E9A6A";
            const demand = demandBySku.get(a.sku) || 1;
            return (
              <div
                key={a.id}
                className="grid grid-cols-[1.2fr_90px_1fr_120px_120px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0"
              >
                <div>
                  <div className="text-ink">
                    {a.title}
                    {demand > 1 ? (
                      <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-accent">
                        {demand} waiting
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-[11px] text-muted">
                    {a.sku}
                    {a.brand ? ` · ${a.brand}` : ""}
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
                  {statusLabel}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px]">@{a.portalUsername}</div>
                  <div className="truncate text-[11px] text-muted">{a.buyerEmail || "no email"}</div>
                </div>
                <div className="font-mono text-[11px] text-muted">
                  {fullDate(a.createdAt)}
                  {a.notifiedAt ? (
                    <div className="text-[10px] text-accent">notified {fullDate(a.notifiedAt)}</div>
                  ) : null}
                </div>
                <NotifyBuyerButton
                  alertId={a.id}
                  disabled={!available || !a.buyerEmail}
                  disabledReason={
                    !a.buyerEmail
                      ? "Buyer has no email on file"
                      : "Piece isn't available right now"
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
