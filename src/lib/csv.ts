// Minimal CSV helpers — RFC-4180-ish quoting.
export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
