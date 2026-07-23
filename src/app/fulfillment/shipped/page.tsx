import Link from "next/link";
import { listInvoices } from "@/lib/firestore/invoices";
import {
  listFulfillmentRecordsByInvoiceIds,
  type FulfillmentBox,
} from "@/lib/firestore/fulfillment";
import { money, fullDate } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FulfillmentTabs } from "@/components/FulfillmentTabs";
import { friendlyCarrierName, trackingUrlFor } from "@/lib/tracking";
import { clsx } from "@/lib/clsx";

export const dynamic = "force-dynamic";

/** Webhook-fed carrier status → chip tone. Exceptions surface loudly. */
function statusTone(status: string | null): "ok" | "bad" | "idle" {
  const s = String(status || "").toLowerCase();
  if (!s) return "idle";
  if (/deliver/.test(s)) return "ok";
  if (/exception|return|fail|attempt|problem|delay/.test(s)) return "bad";
  return "idle";
}

function BoxTrackingRow({ box }: { box: FulfillmentBox }) {
  const tone = statusTone(box.trackingStatus);
  const url = trackingUrlFor(box.carrier, box.trackingNumber);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
      <span className="font-mono text-white/45">Box {box.label}</span>
      <span className="text-white/70">{friendlyCarrierName(box.carrier)}</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-white/70 underline decoration-white/25 hover:text-accent"
        >
          {box.trackingNumber}
        </a>
      ) : (
        <span className="font-mono text-white/70">{box.trackingNumber}</span>
      )}
      <span
        className={clsx(
          "rounded-chip border px-2 py-0.5 font-mono text-[10px]",
          tone === "ok"
            ? "border-[#4E9A6A]/50 bg-[#4E9A6A]/10 text-[#4E9A6A]"
            : tone === "bad"
              ? "border-[#E5484D]/50 bg-[#E5484D]/10 text-[#E5484D]"
              : "border-white/15 text-white/50",
        )}
      >
        {box.trackingStatus || "No carrier status yet"}
      </span>
    </div>
  );
}

/** Recently shipped invoices with live per-box carrier status — the "did it
 *  actually get there" view; delivery exceptions stop dying silently. */
export default async function ShippedPage() {
  const invoices = (await listInvoices({ limit: 300 }))
    .filter((inv) => inv.fulfillmentStatus === "SHIPPED")
    .sort((a, b) => String(b.shippedAt || "").localeCompare(String(a.shippedAt || "")))
    .slice(0, 60);
  const records = await listFulfillmentRecordsByInvoiceIds(invoices.map((i) => i.id));

  return (
    <div>
      <AutoRefresh intervalMs={60_000} />
      <FulfillmentTabs active="/fulfillment/shipped" />
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold">Shipped</h1>
        <span className="text-[12px] text-white/50">
          last {invoices.length} shipment{invoices.length === 1 ? "" : "s"} · carrier status updates
          via webhook
        </span>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/20 px-6 py-14 text-center text-[13px] text-white/50">
          Nothing shipped yet.
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const rec = records.get(inv.id);
            const usedBoxIds = new Set(Object.values(rec?.assignments || {}));
            const boxes = (rec?.boxes || []).filter((b) => usedBoxIds.has(b.id) && b.trackingNumber);
            return (
              <div key={inv.id} className="rounded-card border border-white/15 p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <Link
                      href={`/fulfillment/${inv.id}`}
                      className="font-mono text-[13.5px] font-semibold hover:text-accent"
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <span className="text-[12.5px] text-white/70">
                      {inv.customerName || inv.buyerDisplayName || "—"}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-white/50">
                    shipped {fullDate(inv.shippedAt)} · {inv.itemCount} pc
                    {inv.itemCount === 1 ? "" : "s"} · {money(inv.total)}
                  </span>
                </div>
                {boxes.length ? (
                  <div className="space-y-1">
                    {boxes.map((b) => (
                      <BoxTrackingRow key={b.id} box={b} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11.5px] text-white/40">
                    {inv.trackingNumber
                      ? `${friendlyCarrierName(inv.carrier)} · ${inv.trackingNumber}`
                      : "No tracking recorded."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
