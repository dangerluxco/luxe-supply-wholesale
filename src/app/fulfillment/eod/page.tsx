import Link from "next/link";
import {
  listFulfillmentShippedBetween,
  type FulfillmentRecord,
} from "@/lib/firestore/fulfillment";
import { getInvoiceById } from "@/lib/firestore/invoices";
import { money } from "@/lib/format";
import { FulfillmentTabs } from "@/components/FulfillmentTabs";
import { PrintButton } from "@/components/PrintButton";
import { friendlyCarrierName } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const WAREHOUSE_TZ = "America/New_York";

/** Today's date (YYYY-MM-DD) on the warehouse clock, not the server's UTC clock. */
function warehouseToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WAREHOUSE_TZ }).format(new Date());
}

/** UTC instant of midnight starting the given warehouse-TZ calendar day. */
function warehouseMidnightUtc(dateStr: string): Date {
  // Guess EST (UTC-5), then correct by however far off the rendered local hour is.
  let t = Date.parse(`${dateStr}T00:00:00-05:00`);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: WAREHOUSE_TZ,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(t)),
  );
  if (hour > 0 && hour < 12) t -= hour * 3_600_000;
  else if (hour >= 12) t += (24 - hour) * 3_600_000;
  return new Date(t);
}

function shiftDay(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeOf(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: WAREHOUSE_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function usedBoxes(rec: FulfillmentRecord) {
  const ids = new Set(Object.values(rec.assignments));
  return rec.boxes.filter((b) => ids.has(b.id));
}

/**
 * End-of-day manifest: everything shipped on the selected warehouse day, label
 * spend, and per-carrier box counts for the pickup driver. Printable.
 */
export default async function EndOfDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || "") ? rawDate! : warehouseToday();
  const start = warehouseMidnightUtc(date);
  const end = warehouseMidnightUtc(shiftDay(date, 1));

  const records = await listFulfillmentShippedBetween(start, end);
  const invoices = new Map(
    (
      await Promise.all(
        records.map(async (r) => [r.invoiceId, await getInvoiceById(r.invoiceId).catch(() => null)] as const),
      )
    ).filter(([, inv]) => inv),
  );

  const allBoxes = records.flatMap((r) => usedBoxes(r));
  const pieces = records.reduce((s, r) => s + r.expectedSkus.length, 0);
  const labelSpend = allBoxes.reduce((s, b) => s + (b.labelCost || 0), 0);
  const byCarrier = new Map<string, number>();
  for (const b of allBoxes) {
    const name = friendlyCarrierName(b.carrier) || "Unspecified";
    byCarrier.set(name, (byCarrier.get(name) || 0) + 1);
  }

  const prettyDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <div>
      <style>{`@media print {
        header, aside, nav { display: none !important; }
        main { padding: 0 !important; }
        .print-hide { display: none !important; }
      }`}</style>
      <div className="print-hide">
        <FulfillmentTabs active="/fulfillment/eod" />
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[24px] font-semibold">End of day</h1>
          <span className="font-mono text-[12px] text-white/50">{prettyDate}</span>
        </div>
        <div className="print-hide flex items-center gap-2">
          <Link
            href={`/fulfillment/eod?date=${shiftDay(date, -1)}`}
            className="rounded-chip border border-white/20 px-3 py-1.5 text-[11px] text-white/70 hover:border-accent hover:text-white"
          >
            ‹ Prev day
          </Link>
          {date !== warehouseToday() ? (
            <Link
              href={`/fulfillment/eod?date=${shiftDay(date, 1)}`}
              className="rounded-chip border border-white/20 px-3 py-1.5 text-[11px] text-white/70 hover:border-accent hover:text-white"
            >
              Next day ›
            </Link>
          ) : null}
          <PrintButton
            label="Print manifest"
            className="rounded-chip bg-accent px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink hover:opacity-90"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Shipments", value: String(records.length) },
          { label: "Boxes", value: String(allBoxes.length) },
          { label: "Pieces", value: String(pieces) },
          { label: "Label spend", value: `$${labelSpend.toFixed(2)}` },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-white/15 bg-white/5 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">
              {s.label}
            </div>
            <div className="mt-1 font-mono text-[22px] font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {byCarrier.size ? (
        <div className="mb-6 rounded-card border border-white/15 p-4">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">
            CARRIER PICKUP
          </div>
          <div className="flex flex-wrap gap-4">
            {[...byCarrier.entries()].map(([carrier, count]) => (
              <div key={carrier} className="font-mono text-[13px]">
                <span className="font-semibold">{carrier}</span>{" "}
                <span className="text-white/60">
                  {count} box{count === 1 ? "" : "es"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {records.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/20 px-6 py-14 text-center text-[13px] text-white/50">
          Nothing shipped on {prettyDate}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-white/15">
          <div className="grid grid-cols-[70px_110px_1fr_60px_1.2fr_90px] gap-x-3 border-b border-white/15 bg-white/5 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
            <span>Time</span>
            <span>Invoice</span>
            <span>Buyer</span>
            <span className="text-center">Pcs</span>
            <span>Boxes / tracking</span>
            <span className="text-right">Labels</span>
          </div>
          {records.map((rec) => {
            const inv = invoices.get(rec.invoiceId) || null;
            const boxes = usedBoxes(rec);
            const cost = boxes.reduce((s, b) => s + (b.labelCost || 0), 0);
            return (
              <div
                key={rec.invoiceId}
                className="grid grid-cols-[70px_110px_1fr_60px_1.2fr_90px] items-start gap-x-3 border-b border-white/10 px-5 py-3.5 text-[12.5px] last:border-b-0"
              >
                <span className="font-mono text-[11px] text-white/50">{timeOf(rec.shippedAt)}</span>
                <Link
                  href={`/fulfillment/${rec.invoiceId}`}
                  className="font-mono hover:text-accent"
                >
                  {rec.invoiceNumber}
                </Link>
                <div className="min-w-0">
                  <div className="truncate">
                    {inv?.customerName || inv?.buyerDisplayName || rec.portalUsername || "—"}
                  </div>
                  {inv ? (
                    <div className="font-mono text-[10.5px] text-white/40">{money(inv.total)}</div>
                  ) : null}
                </div>
                <span className="text-center font-mono">{rec.expectedSkus.length}</span>
                <div className="space-y-0.5">
                  {boxes.map((b) => (
                    <div key={b.id} className="font-mono text-[11px] text-white/70">
                      {b.label} · {friendlyCarrierName(b.carrier)} {b.trackingNumber}
                    </div>
                  ))}
                </div>
                <span className="text-right font-mono text-[11.5px] text-white/70">
                  {cost ? `$${cost.toFixed(2)}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
