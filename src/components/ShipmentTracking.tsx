import { getTrackingInfo, type TrackingInfo } from "@/lib/shipengine";
import { trackingUrlFor, friendlyCarrierName } from "@/lib/tracking";
import type { FulfillmentRecord } from "@/lib/firestore/fulfillment";

/**
 * Buyer-facing shipment panel — one card per box with carrier link, live
 * ShipEngine tracking (status, delivery estimate, recent scan events), and the
 * SKUs packed in that box. Server component; live lookups are best-effort and
 * cached ~5 min, falling back to the webhook-stored status, then to a bare
 * tracking link. Used on both the invoice page and the order-request page.
 */

export type ShipmentBoxView = {
  id: string;
  label: string;
  carrier: string;
  trackingNumber: string;
  labelId: string | null;
  trackingStatus: string | null;
  skus: string[];
};

export function shipmentBoxesFromRecord(record: FulfillmentRecord | null): ShipmentBoxView[] {
  if (!record || record.status !== "shipped") return [];
  return record.boxes
    .map((box) => ({
      id: box.id,
      label: box.label,
      carrier: box.carrier,
      trackingNumber: box.trackingNumber,
      labelId: box.labelId,
      trackingStatus: box.trackingStatus,
      skus: Object.entries(record.assignments)
        .filter(([, b]) => b === box.id)
        .map(([sku]) => sku),
    }))
    .filter((b) => b.skus.length);
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(live: TrackingInfo | null, fallback: string | null): {
  text: string;
  cls: string;
} {
  const s = (live?.statusDescription || fallback || "").trim();
  if (!s) return { text: "", cls: "" };
  const lower = s.toLowerCase();
  if (lower.includes("delivered")) return { text: s, cls: "text-[#3E7A55]" };
  if (lower.includes("exception") || lower.includes("return"))
    return { text: s, cls: "text-[#B4232C]" };
  return { text: s, cls: "text-ink" };
}

async function BoxCard({ box }: { box: ShipmentBoxView }) {
  const live = await getTrackingInfo({
    labelId: box.labelId,
    carrier: box.carrier,
    trackingNumber: box.trackingNumber,
  });
  const carrierName = friendlyCarrierName(box.carrier);
  const url = trackingUrlFor(box.carrier, box.trackingNumber);
  const status = statusTone(live, box.trackingStatus);
  const events = (live?.events || []).slice(0, 4);

  return (
    <div className="rounded-chip border border-border bg-ground/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
        <span className="font-semibold text-ink">Box {box.label}</span>
        <span className="font-mono text-[12px]">
          {carrierName}{" "}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {box.trackingNumber}
            </a>
          ) : (
            box.trackingNumber
          )}
        </span>
      </div>

      {status.text ? (
        <div className="mt-1 text-[11.5px] text-secondary">
          Status: <span className={`font-semibold ${status.cls}`}>{status.text}</span>
          {live?.actualDelivery ? (
            <span className="text-muted"> · Delivered {shortDate(live.actualDelivery)}</span>
          ) : live?.estimatedDelivery ? (
            <span className="text-muted"> · Est. delivery {shortDate(live.estimatedDelivery)}</span>
          ) : null}
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="mt-2 space-y-1 border-l-2 border-border pl-3">
          {events.map((e, i) => (
            <div key={i} className="text-[11px] leading-snug">
              <span className={i === 0 ? "text-ink" : "text-muted"}>{e.description}</span>
              <span className="text-muted">
                {e.location ? ` · ${e.location}` : ""}
                {e.at ? ` · ${shortDateTime(e.at)}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {box.skus.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {box.skus.map((sku) => (
            <span
              key={sku}
              className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-secondary"
            >
              {sku}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export async function ShipmentTracking({ boxes }: { boxes: ShipmentBoxView[] }) {
  if (!boxes.length) return null;
  return (
    <div>
      <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
        SHIPMENT — {boxes.length} BOX{boxes.length === 1 ? "" : "ES"}
      </div>
      <div className="space-y-3">
        {boxes.map((box) => (
          <BoxCard key={box.id} box={box} />
        ))}
      </div>
    </div>
  );
}
