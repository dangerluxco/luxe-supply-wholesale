import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getInvoiceByNumber, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { csvBody, isoDate } from "@/lib/csv";

// Single-invoice CSV download (header block + line items + totals).
export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) return new Response("Unauthorized", { status: 401 });

  const inv = await getInvoiceByNumber(decodeURIComponent(number));
  if (!inv || inv.portalUsername !== session.username) {
    return new Response("Not found", { status: 404 });
  }

  const rows: Array<Array<string | number>> = [
    ["Invoice", inv.invoiceNumber],
    ["Company", inv.customerCompany],
    ["Status", displayInvoiceStatus(inv)],
    ["Terms", inv.terms],
    ["Issued", isoDate(inv.issuedAt)],
    ["Due", isoDate(inv.dueDate)],
    ["Paid", isoDate(inv.paidAt)],
    ["Fulfillment", inv.fulfillmentStatus],
    [],
    ["SKU", "Piece", "Wholesale (USD)"],
    ...inv.items.map((l) => [l.sku, l.title, l.price]),
    [],
    ["Subtotal", "", inv.subtotal],
    ["Shipping", "", inv.shipping],
    ["Total", "", inv.total],
  ];

  const body = csvBody(rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inv.invoiceNumber}.csv"`,
    },
  });
}
