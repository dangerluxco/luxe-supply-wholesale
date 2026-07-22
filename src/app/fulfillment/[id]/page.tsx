import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateFulfillment } from "@/lib/firestore/fulfillment";
import { getQuoteById } from "@/lib/firestore/quotes";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { SHIPPING_OPTIONS } from "@/lib/constants";
import { money } from "@/lib/format";
import { PackStation } from "@/components/PackStation";

export const dynamic = "force-dynamic";

/** Item meta (title/image) for each expected SKU, incl. lot members. */
async function buildItemMeta(
  invoiceQuoteId: string,
  items: Array<{ sku: string; title: string; imageUrl: string | null }>,
): Promise<Record<string, { title: string; imageUrl: string | null }>> {
  const meta: Record<string, { title: string; imageUrl: string | null }> = {};
  for (const it of items) meta[it.sku] = { title: it.title, imageUrl: it.imageUrl };
  try {
    if (invoiceQuoteId) {
      const quote = await getQuoteById(invoiceQuoteId);
      for (const it of quote?.items || []) {
        const lotItems = Array.isArray(it.lotItems) ? it.lotItems : [];
        for (const li of lotItems as Array<Record<string, unknown>>) {
          const sku = String(li.sku || "");
          if (sku && !meta[sku]) {
            meta[sku] = {
              title: String(li.title || sku),
              imageUrl: li.imageUrl ? String(li.imageUrl) : null,
            };
          }
        }
      }
    }
  } catch {
    // meta stays best-effort
  }
  return meta;
}

export default async function PackStationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let record, invoice;
  try {
    ({ record, invoice } = await getOrCreateFulfillment(String(id || "").trim()));
  } catch {
    notFound();
  }
  const itemMeta = await buildItemMeta(invoice.quoteId, invoice.items);

  // CEO reference (wholesaleportal-legacy): the shipper always sees the
  // client's ship-to profile — address, preferred method, signature flag.
  const buyer = invoice.portalUsername
    ? await findBuyerByIdentifier(invoice.portalUsername).catch(() => null)
    : null;
  const shipMethod = buyer
    ? SHIPPING_OPTIONS.find((o) => o.id === buyer.shippingMethodId)?.label || null
    : null;
  const addressLines = buyer
    ? [
        buyer.shippingAttn,
        buyer.company,
        buyer.shippingLine1,
        buyer.shippingLine2,
        [buyer.shippingCity, buyer.shippingState, buyer.shippingPostalCode]
          .filter(Boolean)
          .join(", "),
        buyer.shippingCountry,
      ].filter(Boolean)
    : [];

  return (
    <div>
      <Link href="/fulfillment" className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/50 hover:text-white">
        ‹ Queue
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold">
          {invoice.invoiceNumber}
          <span className="ml-3 text-[14px] font-normal text-white/60">
            {invoice.customerName || invoice.buyerDisplayName}
          </span>
        </h1>
        <span className="font-mono text-[12px] text-white/50">
          {record.expectedSkus.length} piece{record.expectedSkus.length === 1 ? "" : "s"} ·{" "}
          {money(invoice.total)}
        </span>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-white/15 bg-white/5 p-4">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">SHIP TO</div>
          {addressLines.length ? (
            <div className="space-y-0.5 text-[12.5px] text-white/80">
              {addressLines.map((line, i) => (
                <div key={i} className={i === 0 ? "font-semibold text-white" : undefined}>
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-white/40">
              No shipping profile on file — check the client account in the portal.
            </p>
          )}
        </div>
        <div className="rounded-card border border-white/15 bg-white/5 p-4">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">
            SHIPPING NOTES
          </div>
          <div className="space-y-1 text-[12.5px] text-white/80">
            {shipMethod ? <div>Method: {shipMethod}</div> : null}
            {buyer?.shippingSignatureRequired ? (
              <div className="font-semibold text-accent">⚠ Signature required on delivery</div>
            ) : null}
            {buyer?.phone ? <div className="font-mono text-[11.5px]">☎ {buyer.phone}</div> : null}
            {!shipMethod && !buyer?.shippingSignatureRequired && !buyer?.phone ? (
              <p className="text-[12px] text-white/40">No preferences recorded.</p>
            ) : null}
          </div>
        </div>
      </div>

      <PackStation invoiceId={invoice.id} initialRecord={record} itemMeta={itemMeta} />
    </div>
  );
}
