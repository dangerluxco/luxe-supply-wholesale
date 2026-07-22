import Link from "next/link";
import { listInvoices } from "@/lib/firestore/invoices";
import { money, fullDate } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

/** Queue of invoices awaiting pack + ship, newest first. */
export default async function FulfillmentQueuePage() {
  const invoices = (await listInvoices({ limit: 300 })).filter(
    (inv) => inv.fulfillmentStatus !== "SHIPPED",
  );

  return (
    <div>
      <AutoRefresh intervalMs={30_000} />
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold">Pack &amp; ship queue</h1>
        <span className="text-[12px] text-white/50">
          {invoices.length} shipment{invoices.length === 1 ? "" : "s"} waiting
        </span>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-card border border-dashed border-white/20 px-6 py-14 text-center text-[13px] text-white/50">
          Nothing to pack — all invoices are shipped.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-white/15">
          <div className="grid grid-cols-[120px_1.2fr_70px_100px_120px_110px] gap-x-3 border-b border-white/15 bg-white/5 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50">
            <span>Invoice</span>
            <span>Buyer</span>
            <span className="text-center">Items</span>
            <span className="text-right">Total</span>
            <span>Issued</span>
            <span className="text-right"> </span>
          </div>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="grid grid-cols-[120px_1.2fr_70px_100px_120px_110px] items-center gap-x-3 border-b border-white/10 px-5 py-3.5 text-[13px] last:border-b-0 hover:bg-white/5"
            >
              <span className="font-mono">{inv.invoiceNumber}</span>
              <div className="min-w-0">
                <div className="truncate">{inv.customerName || inv.buyerDisplayName || "—"}</div>
                <div className="truncate font-mono text-[10.5px] text-white/40">
                  {inv.customerCompany || (inv.portalUsername ? `@${inv.portalUsername}` : "")}
                </div>
              </div>
              <span className="text-center font-mono">{inv.itemCount}</span>
              <span className="text-right font-mono">{money(inv.total)}</span>
              <span className="font-mono text-[11px] text-white/50">{fullDate(inv.issuedAt)}</span>
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
