import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getInvoiceByNumber, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { getFulfillmentForInvoice } from "@/lib/firestore/fulfillment";
import { getAiListingDetails, loadItemImagesBySkus } from "@/lib/firestore/catalog";
import { loadProductOverridesBySku } from "@/lib/firestore/productOverrides";
import { csvBody, csvExcelSku, isoDate } from "@/lib/csv";

// Single-invoice CSV download (header block + line items + totals).
// Line items carry description, per-piece tracking, and EVERY image URL —
// buyers feed this into other platforms, so one thumbnail wasn't enough.
export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) return new Response("Unauthorized", { status: 401 });

  const inv = await getInvoiceByNumber(decodeURIComponent(number));
  if (!inv || inv.portalUsername !== session.username) {
    return new Response("Not found", { status: 404 });
  }

  const skus = inv.items.map((l) => l.sku);
  const [imagesBySku, overridesBySku, fulfillment] = await Promise.all([
    loadItemImagesBySkus(skus).catch(() => new Map<string, string[]>()),
    loadProductOverridesBySku(skus).catch(() => new Map()),
    getFulfillmentForInvoice(inv.id).catch(() => null),
  ]);

  // Staff-entered description wins; AI listing description fills the gaps
  // (same precedence as the buyer PDP).
  const aiNeeded = skus.filter((sku) => !overridesBySku.get(sku)?.description?.trim());
  const aiBySku = new Map(
    await Promise.all(
      aiNeeded.map(
        async (sku) => [sku, await getAiListingDetails(sku).catch(() => null)] as const,
      ),
    ),
  );
  const descriptionFor = (sku: string): string =>
    overridesBySku.get(sku)?.description?.trim() || aiBySku.get(sku)?.description?.trim() || "";

  // Per-piece tracking from the pack-station record (sku → box → tracking);
  // falls back to the invoice-level summary tracking number.
  const boxById = new Map((fulfillment?.boxes || []).map((b) => [b.id, b]));
  const trackingFor = (sku: string): string => {
    const box = boxById.get(fulfillment?.assignments?.[sku] || "");
    return box?.trackingNumber || inv.trackingNumber || "";
  };

  const imagesFor = (l: { sku: string; imageUrl: string | null }): string[] => {
    const all = imagesBySku.get(l.sku) || [];
    if (all.length) return all;
    return l.imageUrl ? [l.imageUrl] : [];
  };
  const maxImages = Math.max(1, ...inv.items.map((l) => imagesFor(l).length));
  const imageHeaders = Array.from({ length: maxImages }, (_, i) => `Image URL ${i + 1}`);

  const rows: Array<Array<string | number>> = [
    ["Invoice", inv.invoiceNumber],
    ["Company", inv.customerCompany],
    ["Status", displayInvoiceStatus(inv)],
    ["Terms", inv.terms],
    ["PO number", inv.poNumber || ""],
    ["Issued", isoDate(inv.issuedAt)],
    ["Due", isoDate(inv.dueDate)],
    ["Paid", isoDate(inv.paidAt)],
    ["Fulfillment", inv.fulfillmentStatus],
    ["Carrier", inv.carrier || ""],
    ["Tracking", inv.trackingNumber || ""],
    [],
    ["SKU", "Piece", "Brand", "Description", "Wholesale (USD)", "Tracking", ...imageHeaders],
    ...inv.items.map((l) => {
      const images = imagesFor(l);
      return [
        csvExcelSku(l.sku),
        l.title,
        l.brand || "",
        descriptionFor(l.sku),
        l.price,
        trackingFor(l.sku),
        ...imageHeaders.map((_, i) => images[i] || ""),
      ];
    }),
    [],
    ["Subtotal", "", "", "", inv.subtotal],
    ["Shipping", "", "", "", inv.shipping],
    ["Total", "", "", "", inv.total],
  ];

  const body = csvBody(rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inv.invoiceNumber}.csv"`,
    },
  });
}
