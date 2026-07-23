import Link from "next/link";
import { listInvoices, displayInvoiceStatus, type PortalInvoice } from "@/lib/firestore/invoices";
import {
  listFulfillmentRecordsByInvoiceIds,
  type FulfillmentRecord,
} from "@/lib/firestore/fulfillment";
import { money, fullDate } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FulfillmentTabs } from "@/components/FulfillmentTabs";
import { clsx } from "@/lib/clsx";

export const dynamic = "force-dynamic";

/** Whole days since the invoice was issued. */
function ageDays(inv: PortalInvoice): number {
  const t = inv.issuedAt || inv.createdAt;
  if (!t) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000));
}

function AgeChip({ days }: { days: number }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-chip border px-2 py-0.5 font-mono text-[10.5px]",
        days >= 7
          ? "border-[#E5484D]/50 bg-[#E5484D]/10 text-[#E5484D]"
          : days >= 3
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-white/15 text-white/50",
      )}
    >
      {days}d
    </span>
  );
}

function PaymentChip({ inv }: { inv: PortalInvoice }) {
  const status = displayInvoiceStatus(inv);
  const label =
    status === "PAID"
      ? "PAID"
      : status === "OVERDUE"
        ? "OVERDUE"
        : inv.amountPaid > 0
          ? "PARTIAL"
          : "UNPAID";
  return (
    <span
      className={clsx(
        "inline-flex rounded-chip border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
        label === "PAID"
          ? "border-[#4E9A6A]/50 bg-[#4E9A6A]/10 text-[#4E9A6A]"
          : label === "OVERDUE"
            ? "border-[#E5484D]/50 bg-[#E5484D]/10 text-[#E5484D]"
            : label === "PARTIAL"
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-white/15 text-white/50",
      )}
    >
      {label}
    </span>
  );
}

/** Pack progress from the fulfillment record: boxed count + purchased labels. */
function Progress({ rec }: { rec: FulfillmentRecord | undefined }) {
  if (!rec || (!rec.boxes.length && !Object.keys(rec.assignments).length)) {
    return <span className="text-[11px] text-white/35">not started</span>;
  }
  const boxed = rec.expectedSkus.filter((s) => rec.assignments[s]).length;
  const usedBoxIds = new Set(Object.values(rec.assignments));
  const usedBoxes = rec.boxes.filter((b) => usedBoxIds.has(b.id));
  const withTracking = usedBoxes.filter((b) => b.trackingNumber).length;
  const done = boxed === rec.expectedSkus.length && usedBoxes.length > 0;
  return (
    <span className={clsx("font-mono text-[11px]", done ? "text-[#4E9A6A]" : "text-accent")}>
      {boxed}/{rec.expectedSkus.length} boxed
      {usedBoxes.length ? ` · ${withTracking}/${usedBoxes.length} labeled` : ""}
    </span>
  );
}

/** Queue of invoices awaiting pack + ship — oldest first, so nothing rots at the bottom. */
export default async function FulfillmentQueuePage() {
  const invoices = (await listInvoices({ limit: 300 }))
    .filter((inv) => inv.fulfillmentStatus !== "SHIPPED")
    .sort((a, b) =>
      String(a.issuedAt || a.createdAt || "").localeCompare(String(b.issuedAt || b.createdAt || "")),
    );
  const records = await listFulfillmentRecordsByInvoiceIds(invoices.map((i) => i.id));

  return (
    <div>
      <AutoRefresh intervalMs={30_000} />
      <FulfillmentTabs active="/fulfillment" />
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold">Pack &amp; ship queue</h1>
        <span className="text-[12px] text-white/50">
          {invoices.length} shipment{invoices.length === 1 ? "" : "s"} waiting · oldest first
        </span>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/20 px-6 py-14 text-center text-[13px] text-white/50">
          Nothing to pack — all invoices are shipped.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-white/15">
          <div className="grid grid-cols-[110px_1.1fr_54px_84px_150px_95px_90px] items-center gap-x-3 border-b border-white/15 bg-white/5 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
            <span>Invoice</span>
            <span>Buyer</span>
            <span>Age</span>
            <span>Payment</span>
            <span>Progress</span>
            <span className="text-right">Total</span>
            <span className="text-right"> </span>
          </div>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="grid grid-cols-[110px_1.1fr_54px_84px_150px_95px_90px] items-center gap-x-3 border-b border-white/10 px-5 py-3.5 text-[13px] last:border-b-0 hover:bg-white/5"
            >
              <div>
                <div className="font-mono">{inv.invoiceNumber}</div>
                <div className="font-mono text-[10px] text-white/40">{fullDate(inv.issuedAt)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate">{inv.customerName || inv.buyerDisplayName || "—"}</div>
                <div className="truncate font-mono text-[10.5px] text-white/40">
                  {inv.customerCompany || (inv.portalUsername ? `@${inv.portalUsername}` : "")}
                  {" · "}
                  {inv.itemCount} pc{inv.itemCount === 1 ? "" : "s"}
                </div>
              </div>
              <AgeChip days={ageDays(inv)} />
              <PaymentChip inv={inv} />
              <Progress rec={records.get(inv.id)} />
              <span className="text-right font-mono">{money(inv.total)}</span>
              <div className="text-right">
                <Link
                  href={`/fulfillment/${inv.id}`}
                  className="inline-flex h-8 items-center rounded-chip bg-accent px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink hover:opacity-90"
                >
                  Pack
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
