import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateFulfillment } from "@/lib/firestore/fulfillment";
import { getQuoteById } from "@/lib/firestore/quotes";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { getShippingRules } from "@/lib/firestore/settings";
import { shippingMethodLabel } from "@/lib/shipping-rules";
import { money } from "@/lib/format";
import { PackStation } from "@/components/PackStation";
import { shipEngineConfigured } from "@/lib/shipengine";
import { loadItemImagesBySkus } from "@/lib/firestore/catalog";
import { requireFulfillmentAccess } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Item meta (title/photos) for each expected SKU, incl. lot members. All of a
 *  piece's photos load so the packer can click into a full gallery to ID it. */
async function buildItemMeta(
  invoiceQuoteId: string,
  items: Array<{ sku: string; title: string; imageUrl: string | null }>,
): Promise<Record<string, { title: string; imageUrl: string | null; images: string[] }>> {
  const meta: Record<string, { title: string; imageUrl: string | null; images: string[] }> = {};
  for (const it of items) meta[it.sku] = { title: it.title, imageUrl: it.imageUrl, images: [] };
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
              images: [],
            };
          }
        }
      }
    }
  } catch {
    // meta stays best-effort
  }
  try {
    const imagesBySku = await loadItemImagesBySkus(Object.keys(meta));
    for (const [sku, images] of imagesBySku) {
      const m = meta[sku];
      if (!m) continue;
      m.images = images;
      if (!m.imageUrl && images[0]) m.imageUrl = images[0];
    }
  } catch {
    // gallery stays best-effort — single thumbnails still work
  }
  return meta;
}

export default async function PackStationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireFulfillmentAccess();
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
    ? shippingMethodLabel(await getShippingRules(), buyer.shippingMethodId)
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
            {invoice.packingNote ? (
              <div className="whitespace-pre-line rounded-chip border border-accent/50 bg-accent/10 px-2.5 py-2 text-[13px] font-semibold text-accent">
                📦 {invoice.packingNote}
              </div>
            ) : null}
            {shipMethod ? <div>Method: {shipMethod}</div> : null}
            {buyer?.shippingSignatureRequired ? (
              <div className="font-semibold text-accent">⚠ Signature required on delivery</div>
            ) : null}
            {buyer?.phone ? <div className="font-mono text-[11.5px]">☎ {buyer.phone}</div> : null}
            {buyer?.shippingInstructions ? (
              <div className="whitespace-pre-line rounded-chip border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] text-white/70">
                {buyer.shippingInstructions}
              </div>
            ) : null}
            {!invoice.packingNote &&
            !shipMethod &&
            !buyer?.shippingSignatureRequired &&
            !buyer?.phone &&
            !buyer?.shippingInstructions ? (
              <p className="text-[12px] text-white/40">No preferences recorded.</p>
            ) : null}
          </div>
        </div>
      </div>

      <PackStation
        invoiceId={invoice.id}
        initialRecord={record}
        itemMeta={itemMeta}
        shipEngineEnabled={shipEngineConfigured()}
        signatureDefault={!!buyer?.shippingSignatureRequired}
        isAdmin={session?.role === ROLE.MANAGER}
      />
    </div>
  );
}
