/**
 * Shared spreadsheet-paste parser for SKU batch inputs. Accepts:
 * - SKU only (one per line, or comma/space separated on one line)
 * - Two columns: SKU + price (tab-separated Excel copy, or comma-separated)
 * Dollar signs/commas in prices are tolerated; prices round to whole USD.
 */
export function parsePrice(raw: string): number | undefined {
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : undefined;
}

export function parseSkuBatch(text: string): Array<{ sku: string; price?: number }> {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed: Array<{ sku: string; price?: number }> = [];
  const seen = new Set<string>();

  function push(sku: string, priceRaw?: string) {
    const key = sku.toUpperCase();
    if (!sku || seen.has(key)) return;
    seen.add(key);
    const price = priceRaw ? parsePrice(priceRaw) : undefined;
    parsed.push(price !== undefined ? { sku, price } : { sku });
  }

  for (const line of lines) {
    if (line.includes("\t")) {
      const parts = line.split("\t").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 1) push(parts[0]!, parts[1]);
      continue;
    }
    if (line.includes(",")) {
      const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 1) push(parts[0]!, parts[1]);
      continue;
    }
    // Space-separated tokens are all SKUs (prices come only via tab/comma —
    // "SKU 1234" is ambiguous, and spreadsheet pastes always use tabs).
    for (const p of line.split(/\s+/).map((x) => x.trim()).filter(Boolean)) push(p);
  }
  return parsed;
}
