import { csvBody } from "@/lib/csv";
import type { CurationItem, CurationShare } from "@/lib/firestore/curation";

/** Approved-item CSV export for a curation share (staff: includeCost; buyer: never). */
export function buildCurationApprovedCsv(
  share: Pick<CurationShare, "clientName" | "invoiceDate" | "items">,
  opts?: { includeCost?: boolean },
): string {
  const approved = share.items.filter((it: CurationItem) => it.decision === "approve");
  const includeCost = !!opts?.includeCost;

  const metaLines: Array<string[]> = [];
  if (share.clientName) metaLines.push(["Client", share.clientName]);
  if (share.invoiceDate) metaLines.push(["Invoice Date", share.invoiceDate]);

  const header = [
    "SKU",
    "Title",
    "Brand",
    "Condition",
    ...(includeCost ? ["Cost"] : []),
    "Price",
    "Notes",
    "Image URL",
    "Image URLs",
  ];

  const rows = approved.map((it) => [
    it.sku,
    it.title,
    it.brand,
    it.condition,
    ...(includeCost ? [it.cost != null ? it.cost : ""] : []),
    it.price,
    it.note,
    it.imageUrl || "",
    it.imageUrls.join("; "),
  ]);

  return csvBody([...metaLines, header, ...rows]);
}

export function curationCsvFilename(share: Pick<CurationShare, "clientName" | "invoiceDate">): string {
  const stamp = share.invoiceDate || new Date().toISOString().slice(0, 10);
  const safeClient = (share.clientName || "catalog")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
  return `curation-${safeClient || "catalog"}-${stamp}.csv`;
}
