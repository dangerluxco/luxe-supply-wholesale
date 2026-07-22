// Minimal CSV helpers — RFC-4180-ish quoting.
export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  // Pass through Excel text-formula cells (see csvExcelSku) untouched.
  if (/^="[^"]*"$/.test(s)) return s;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Long numeric SKUs: Excel renders bare 12+ digit numbers in scientific
 * notation ("4.9E+12", read in the meeting as a broken decimal). The ="…"
 * text-formula form shows every digit with no decimals. Short/alphanumeric
 * SKUs pass through unchanged.
 */
export function csvExcelSku(sku: string | number | null | undefined): string {
  const s = String(sku ?? "").trim();
  return /^\d{7,}$/.test(s) ? `="${s}"` : s;
}

export function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

export function csvBody(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map(csvRow).join("\r\n");
}

export function isoDate(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
