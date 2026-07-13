import { listHoldAlertsForStaff } from "@/lib/firestore/holdAlerts";
import { EmptyState } from "@/components/EmptyState";
import { fullDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StaffWishlistPage() {
  const alerts = await listHoldAlertsForStaff();

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Wishlist demand</h1>
        <span className="text-[12px] text-muted">
          Buyers waiting on held pieces · Firestore `salesPortalHoldAlerts`
        </span>
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          title="No active wishlist alerts."
          hint="Buyers can request a notification from a held piece's product page."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_120px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Item</span>
            <span>Buyer</span>
            <span>Email</span>
            <span>Requested</span>
          </div>
          {alerts.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[1.2fr_1fr_1fr_120px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0"
            >
              <div>
                <div className="text-ink">{a.title}</div>
                <div className="font-mono text-[11px] text-muted">
                  {a.sku}
                  {a.brand ? ` · ${a.brand}` : ""}
                </div>
              </div>
              <span className="font-mono text-[11px]">@{a.portalUsername}</span>
              <span className="truncate">{a.buyerEmail || "—"}</span>
              <span className="font-mono text-[11px] text-muted">{fullDate(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
