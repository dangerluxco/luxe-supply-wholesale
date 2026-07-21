import { PDFDocument, PDFFont, StandardFonts, rgb, degrees } from "pdf-lib";
import type { PortalInvoice } from "@/lib/firestore/invoices";

// Brand palette — mirrors the storefront Tailwind theme.
const INK = rgb(0.086, 0.086, 0.102); // #16161A
const GOLD = rgb(0.69, 0.553, 0.243); // #B08D3E
const MUTED = rgb(0.545, 0.537, 0.498); // #8B897F
const BODY = rgb(0.227, 0.224, 0.204); // #3A3934
const HAIRLINE = rgb(0.878, 0.871, 0.839); // #E0DEd6-ish
const GROUND = rgb(0.957, 0.949, 0.925); // #F4F2EC
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.306, 0.604, 0.416); // #4E9A6A

const PAGE_W = 612; // Letter
const PAGE_H = 792;
const MARGIN = 48;

function fmtMoney(n: number): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export const DEFAULT_PAYMENT_INSTRUCTIONS = [
  "Please remit payment by wire or ACH to:",
  "Account name: Luxe Supply Corporation",
  "Bank, account and routing details are provided by your sales representative.",
  "Questions: help@luxesupply.co",
].join("\n");

/**
 * Branded invoice PDF — ink header band with the LUXE SUPPLY* wordmark, bill-to
 * and terms meta, line items, totals, and the org's wire/payment instructions
 * (editable on staff Settings). Pure pdf-lib: no runtime font/file dependencies,
 * so it's safe in the Cloud Run standalone build.
 */
export type InvoicePdfLetterhead = {
  brandName?: string;
  legalName?: string;
  tagline?: string;
  taxId?: string;
};

export async function renderInvoicePdf(
  inv: PortalInvoice,
  opts: {
    statusLabel: string;
    paymentInstructions?: string | null;
    letterhead?: InvoicePdfLetterhead | null;
  },
): Promise<Uint8Array> {
  const brandName = (opts.letterhead?.brandName || "Luxe Supply").trim() || "Luxe Supply";
  const legalName =
    (opts.letterhead?.legalName || "Luxe Supply Corporation").trim() || "Luxe Supply Corporation";
  const tagline =
    (opts.letterhead?.tagline || "").trim() ||
    `${legalName.toUpperCase()}  ·  HELP@LUXESUPPLY.CO`;
  const brandMark = brandName.replace(/\*/g, "").toUpperCase().slice(0, 28);

  const doc = await PDFDocument.create();
  doc.setTitle(`${inv.invoiceNumber} — ${brandName}`);
  doc.setAuthor(legalName);

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page = doc.addPage([PAGE_W, PAGE_H]);

  // ---- Header band -----------------------------------------------------------
  const HEADER_H = 92;
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: INK });

  const brandY = PAGE_H - 40;
  page.drawText(brandMark, { x: MARGIN, y: brandY, size: 19, font: helvBold, color: WHITE });
  page.drawText("*", {
    x: MARGIN + helvBold.widthOfTextAtSize(brandMark, 19) + 2,
    y: brandY,
    size: 19,
    font: helvBold,
    color: GOLD,
  });
  page.drawText(tagline.slice(0, 90), {
    x: MARGIN,
    y: PAGE_H - 62,
    size: 7,
    font: helv,
    color: rgb(0.72, 0.71, 0.68),
  });

  const invLabel = "INVOICE";
  page.drawText(invLabel, {
    x: PAGE_W - MARGIN - helvBold.widthOfTextAtSize(invLabel, 9),
    y: PAGE_H - 34,
    size: 9,
    font: helvBold,
    color: GOLD,
  });
  page.drawText(inv.invoiceNumber, {
    x: PAGE_W - MARGIN - helvBold.widthOfTextAtSize(inv.invoiceNumber, 17),
    y: PAGE_H - 52,
    size: 17,
    font: helvBold,
    color: WHITE,
  });
  const statusText = opts.statusLabel.toUpperCase();
  page.drawText(statusText, {
    x: PAGE_W - MARGIN - helvBold.widthOfTextAtSize(statusText, 9),
    y: PAGE_H - 70,
    size: 9,
    font: helvBold,
    color: statusText === "PAID" ? GREEN : statusText === "OVERDUE" ? rgb(0.65, 0.33, 0.25) : GOLD,
  });

  let y = PAGE_H - HEADER_H - 34;

  // ---- Bill to + meta ---------------------------------------------------------
  page.drawText("BILL TO", { x: MARGIN, y, size: 8, font: helvBold, color: GOLD });
  const metaX = 330;
  const metaColW = (PAGE_W - MARGIN - metaX) / 2;

  let billY = y - 16;
  const billLines = [
    { text: inv.customerCompany || inv.customerName || "—", font: helvBold, size: 11, color: INK },
    ...(inv.customerCompany && inv.customerName
      ? [{ text: inv.customerName, font: helv, size: 10, color: BODY }]
      : []),
    ...(inv.customerEmail ? [{ text: inv.customerEmail, font: helv, size: 9, color: MUTED }] : []),
    ...(inv.customerPhone ? [{ text: inv.customerPhone, font: helv, size: 9, color: MUTED }] : []),
  ];
  for (const l of billLines) {
    page.drawText(l.text, { x: MARGIN, y: billY, size: l.size, font: l.font, color: l.color });
    billY -= l.size + 5;
  }

  const metaEntries: Array<[string, string]> = [
    ["ISSUED", fmtDate(inv.issuedAt)],
    ["DUE", fmtDate(inv.dueDate)],
    ["TERMS", inv.terms || "—"],
    ...(opts.letterhead?.taxId
      ? ([["TAX ID", opts.letterhead.taxId]] as Array<[string, string]>)
      : []),
    ...(inv.paidAt ? ([["PAID", fmtDate(inv.paidAt)]] as Array<[string, string]>) : []),
    ...(inv.fulfillmentStatus === "SHIPPED"
      ? ([
          ["CARRIER", inv.carrier || "—"],
          ["TRACKING", inv.trackingNumber || "—"],
        ] as Array<[string, string]>)
      : []),
  ];
  metaEntries.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const mx = metaX + col * metaColW;
    const my = y - row * 30;
    page.drawText(k, { x: mx, y: my, size: 7, font: helvBold, color: MUTED });
    page.drawText(v, { x: mx, y: my - 12, size: 9.5, font: mono, color: INK });
  });

  y = Math.min(billY, y - Math.ceil(metaEntries.length / 2) * 30 - 10) - 14;

  // ---- Items table -------------------------------------------------------------
  const colSkuX = PAGE_W - MARGIN - 210;
  const colPriceRight = PAGE_W - MARGIN;

  function drawTableHeader() {
    page.drawText("PIECE", { x: MARGIN, y, size: 7.5, font: helvBold, color: GOLD });
    page.drawText("SKU", { x: colSkuX, y, size: 7.5, font: helvBold, color: GOLD });
    const wh = "WHOLESALE";
    page.drawText(wh, {
      x: colPriceRight - helvBold.widthOfTextAtSize(wh, 7.5),
      y,
      size: 7.5,
      font: helvBold,
      color: GOLD,
    });
    y -= 8;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.8,
      color: INK,
    });
    y -= 16;
  }

  drawTableHeader();

  for (const item of inv.items) {
    if (y < 190) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN - 10;
      drawTableHeader();
    }
    const title = item.quantity > 1 ? `${item.title}  × ${item.quantity}` : item.title;
    const titleLines = wrapText(title || item.sku, helv, 9.5, colSkuX - MARGIN - 14);
    const rowH = Math.max(titleLines.length * 12, 12);

    let ty = y;
    for (const line of titleLines) {
      page.drawText(line, { x: MARGIN, y: ty, size: 9.5, font: helv, color: BODY });
      ty -= 12;
    }
    page.drawText(item.sku, { x: colSkuX, y, size: 8.5, font: mono, color: MUTED });
    const price = fmtMoney(item.price * Math.max(1, item.quantity));
    page.drawText(price, {
      x: colPriceRight - mono.widthOfTextAtSize(price, 9.5),
      y,
      size: 9.5,
      font: mono,
      color: INK,
    });

    y -= rowH + 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.4,
      color: HAIRLINE,
    });
    y -= 14;
  }

  // ---- Totals -------------------------------------------------------------------
  if (y < 210) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN - 10;
  }
  const totalsX = PAGE_W - MARGIN - 200;
  const totalRows: Array<[string, string, boolean]> = [
    ["Subtotal", fmtMoney(inv.subtotal), false],
    ["Shipping", fmtMoney(inv.shipping), false],
  ];
  for (const [k, v] of totalRows) {
    page.drawText(k, { x: totalsX, y, size: 9.5, font: helv, color: MUTED });
    page.drawText(v, {
      x: colPriceRight - mono.widthOfTextAtSize(v, 9.5),
      y,
      size: 9.5,
      font: mono,
      color: INK,
    });
    y -= 16;
  }
  page.drawLine({
    start: { x: totalsX, y: y + 4 },
    end: { x: colPriceRight, y: y + 4 },
    thickness: 0.8,
    color: INK,
  });
  y -= 8;
  page.drawText("Invoice total", { x: totalsX, y, size: 11, font: helvBold, color: INK });
  const totalStr = fmtMoney(inv.total);
  page.drawText(totalStr, {
    x: colPriceRight - helvBold.widthOfTextAtSize(totalStr, 15),
    y: y - 2,
    size: 15,
    font: helvBold,
    color: INK,
  });
  y -= 38;

  // ---- Payment / wire instructions ------------------------------------------------
  const instructions = (opts.paymentInstructions || "").trim() || DEFAULT_PAYMENT_INSTRUCTIONS;
  const instrLines = [
    ...wrapText(instructions, helv, 9, PAGE_W - 2 * MARGIN - 40),
    "",
    `Wire reference: ${inv.invoiceNumber}`,
  ];
  const boxH = 34 + instrLines.length * 12;
  if (y - boxH < 70) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN - 10;
  }
  page.drawRectangle({
    x: MARGIN,
    y: y - boxH,
    width: PAGE_W - 2 * MARGIN,
    height: boxH,
    color: GROUND,
  });
  page.drawRectangle({ x: MARGIN, y: y - boxH, width: 3, height: boxH, color: GOLD });
  page.drawText("PAYMENT · WIRE INSTRUCTIONS", {
    x: MARGIN + 16,
    y: y - 18,
    size: 8,
    font: helvBold,
    color: GOLD,
  });
  let iy = y - 34;
  for (const line of instrLines) {
    const isRef = line.startsWith("Wire reference:");
    page.drawText(line, {
      x: MARGIN + 16,
      y: iy,
      size: 9,
      font: isRef ? helvBold : helv,
      color: isRef ? INK : BODY,
    });
    iy -= 12;
  }
  y = y - boxH - 24;

  // ---- Footer ----------------------------------------------------------------------
  page.drawLine({
    start: { x: MARGIN, y: 58 },
    end: { x: PAGE_W - MARGIN, y: 58 },
    thickness: 0.4,
    color: HAIRLINE,
  });
  page.drawText(
    "Every piece is one of one, authenticated, and insured in transit. Thank you for collecting with Luxe Supply Co.",
    { x: MARGIN, y: 44, size: 7.5, font: helv, color: MUTED },
  );

  // ---- PAID stamp --------------------------------------------------------------------
  if (opts.statusLabel.toUpperCase() === "PAID") {
    const first = doc.getPage(0);
    first.drawText("PAID", {
      x: PAGE_W / 2 - 105,
      y: PAGE_H / 2 - 40,
      size: 110,
      font: helvBold,
      color: GREEN,
      opacity: 0.12,
      rotate: degrees(24),
    });
  }

  return doc.save();
}
