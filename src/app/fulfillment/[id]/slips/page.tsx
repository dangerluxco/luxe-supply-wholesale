import { notFound } from "next/navigation";
import { getOrCreateFulfillment } from "@/lib/firestore/fulfillment";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { fullDate } from "@/lib/format";
import { friendlyCarrierName } from "@/lib/tracking";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Printable per-box packing slips — one slip per box, page break between boxes.
 * Customer-facing: contents + ship-to, no prices, no internal notes. The dark
 * console chrome (header/sidebar) is hidden by the print rules below.
 */
export default async function PackingSlipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let record, invoice;
  try {
    ({ record, invoice } = await getOrCreateFulfillment(String(id || "").trim()));
  } catch {
    notFound();
  }

  const buyer = invoice.portalUsername
    ? await findBuyerByIdentifier(invoice.portalUsername).catch(() => null)
    : null;
  const shipToLines = buyer
    ? [
        buyer.shippingAttn || buyer.displayName || invoice.customerName,
        buyer.company,
        buyer.shippingLine1,
        buyer.shippingLine2,
        [buyer.shippingCity, buyer.shippingState, buyer.shippingPostalCode]
          .filter(Boolean)
          .join(", "),
        buyer.shippingCountry,
      ].filter(Boolean)
    : [invoice.customerName, invoice.customerCompany].filter(Boolean);

  const titleBySku = new Map(invoice.items.map((i) => [i.sku.toUpperCase(), i.title]));
  const usedBoxIds = new Set(Object.values(record.assignments));
  const boxes = record.boxes.filter((b) => usedBoxIds.has(b.id));
  const boxItems = (boxId: string) =>
    Object.entries(record.assignments)
      .filter(([, b]) => b === boxId)
      .map(([sku]) => sku);

  return (
    <div className="rounded-card bg-white p-8 text-ink print:rounded-none print:p-0">
      <style>{`@media print {
        header, aside, nav { display: none !important; }
        main { padding: 0 !important; }
        body { background: #fff !important; }
        .slip-page { page-break-after: always; }
        .slip-page:last-child { page-break-after: auto; }
      }`}</style>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-[13px] text-secondary">
          {boxes.length} packing slip{boxes.length === 1 ? "" : "s"} — one per box, each on its own
          page.
        </p>
        <PrintButton
          label="Print all"
          className="rounded-chip bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white hover:opacity-90"
        />
      </div>

      {boxes.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-secondary">
          Nothing packed yet — scan pieces into boxes first.
        </p>
      ) : (
        boxes.map((box, i) => {
          const items = boxItems(box.id);
          return (
            <div key={box.id} className="slip-page mb-10 border-t border-border pt-8 first:border-t-0 first:pt-0">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <div className="text-[18px] font-semibold tracking-[0.04em]">
                    LUXE SUPPLY<span className="text-accent">*</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-secondary">PACKING SLIP</div>
                </div>
                <div className="text-right font-mono text-[12px]">
                  <div className="font-semibold">{invoice.invoiceNumber}</div>
                  <div className="text-secondary">{fullDate(invoice.issuedAt)}</div>
                  <div className="mt-1 text-[13px] font-semibold">
                    Box {box.label} — {i + 1} of {boxes.length}
                  </div>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-6">
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-secondary">
                    Ship to
                  </div>
                  <div className="text-[13px] leading-relaxed">
                    {shipToLines.map((line, j) => (
                      <div key={j} className={j === 0 ? "font-semibold" : undefined}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-secondary">
                    Shipment
                  </div>
                  <div className="text-[13px] leading-relaxed">
                    {box.trackingNumber ? (
                      <>
                        <div>{friendlyCarrierName(box.carrier)}</div>
                        <div className="font-mono text-[12px]">{box.trackingNumber}</div>
                      </>
                    ) : (
                      <div className="text-secondary">Tracking pending</div>
                    )}
                    <div className="mt-1 text-[12px] text-secondary">
                      {record.expectedSkus.length} piece{record.expectedSkus.length === 1 ? "" : "s"}{" "}
                      total across {boxes.length} box{boxes.length === 1 ? "" : "es"}
                    </div>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-ink text-left font-mono text-[10px] uppercase tracking-[0.12em] text-secondary">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((sku, j) => (
                    <tr key={sku} className="border-b border-border">
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-secondary">{j + 1}</td>
                      <td className="py-2.5 pr-3">{titleBySku.get(sku.toUpperCase()) || sku}</td>
                      <td className="py-2.5 pr-3 font-mono text-[11.5px]">{sku}</td>
                      <td className="py-2.5 text-right font-mono">1</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-6 text-[11px] text-secondary">
                Every Luxe Supply piece is one-of-one. Please inspect on arrival and report any
                issue within 48 hours.
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
