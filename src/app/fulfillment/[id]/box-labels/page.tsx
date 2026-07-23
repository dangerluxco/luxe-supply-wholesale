import { notFound } from "next/navigation";
import { getOrCreateFulfillment } from "@/lib/firestore/fulfillment";
import { Code39 } from "@/components/Code39";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Printable box ID labels — one per box, invoice number + client name in large
 * type plus the box's BOX-… barcode, so a wall of sealed boxes stays
 * identifiable and re-scannable at the pack station. These are internal box
 * identity labels, not carrier shipping labels.
 */
export default async function BoxLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ box?: string }>;
}) {
  const { id } = await params;
  const { box: boxFilter } = await searchParams;
  let record, invoice;
  try {
    ({ record, invoice } = await getOrCreateFulfillment(String(id || "").trim()));
  } catch {
    notFound();
  }

  const clientName = invoice.customerCompany || invoice.customerName || record.portalUsername;
  const boxItemCount = (boxId: string) =>
    Object.values(record.assignments).filter((b) => b === boxId).length;

  // ?box=<id|barcode> prints just that box (the per-box 🏷 link at the pack
  // station); no filter prints the whole sheet. Ordinals stay based on the
  // full box list either way, so a single label still reads "2 of 3".
  const wanted = String(boxFilter || "").trim();
  const printable = record.boxes
    .map((box, i) => ({ box, ordinal: i + 1 }))
    .filter(({ box }) => !wanted || box.id === wanted || box.barcode === wanted);

  return (
    <div className="rounded-card bg-white p-8 text-ink print:rounded-none print:p-0">
      <style>{`@media print {
        header, aside, nav { display: none !important; }
        main { padding: 0 !important; }
        body { background: #fff !important; }
        .label-page { page-break-after: always; }
        .label-page:last-child { page-break-after: auto; }
      }`}</style>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-[13px] text-secondary">
          {printable.length} box label{printable.length === 1 ? "" : "s"} — one per box, each on
          its own page. Stick it on the box; scanning the barcode re-selects that box at the pack
          station.
        </p>
        <PrintButton
          label={printable.length === 1 ? "Print label" : "Print all"}
          className="rounded-chip bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white hover:opacity-90"
        />
      </div>

      {printable.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-secondary">
          {wanted
            ? "That box is no longer on this shipment."
            : "No boxes yet — add boxes at the pack station first."}
        </p>
      ) : (
        printable.map(({ box, ordinal }) => (
          <div
            key={box.id}
            className="label-page mb-10 flex flex-col items-center border-t border-border pt-10 text-center first:border-t-0 first:pt-0"
          >
            <div className="font-mono text-[13px] uppercase tracking-[0.2em] text-secondary">
              Luxe Supply — Box label
            </div>
            <div className="mt-4 text-[42px] font-bold leading-tight">{invoice.invoiceNumber}</div>
            <div className="mt-1 text-[28px] font-semibold">{clientName}</div>
            <div className="mt-4 font-mono text-[20px]">
              Box {box.label} — {ordinal} of {record.boxes.length}
            </div>
            <div className="mt-1 text-[13px] text-secondary">
              {boxItemCount(box.id)} piece{boxItemCount(box.id) === 1 ? "" : "s"} packed
            </div>
            <div className="mt-6">
              <Code39 value={box.barcode} height={64} narrow={2} />
              <div className="mt-1 font-mono text-[13px] tracking-[0.1em]">{box.barcode}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
