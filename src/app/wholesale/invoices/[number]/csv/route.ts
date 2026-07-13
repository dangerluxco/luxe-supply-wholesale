import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { csvBody, isoDate } from "@/lib/csv";

// Single-invoice CSV download (header block + line items + totals).
export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await getSession();
  if (!session?.accountId) return new Response("Unauthorized", { status: 401 });

  const inv = await prisma.invoice.findUnique({
    where: { number },
    include: { account: true },
  });
  if (!inv || inv.accountId !== session.accountId) {
    return new Response("Not found", { status: 404 });
  }

  const line: { name: string; sku: string; price: number }[] = JSON.parse(inv.lineItems);

  const rows: Array<Array<string | number>> = [
    ["Invoice", inv.number],
    ["Account", inv.account.company],
    ["Status", inv.status],
    ["PO Number", inv.poNumber ?? ""],
    ["Terms", inv.terms],
    ["Issued", isoDate(inv.issuedAt)],
    ["Due", isoDate(inv.dueDate)],
    ["Paid", isoDate(inv.paidAt)],
    [],
    ["SKU", "Piece", "Wholesale (USD)"],
    ...line.map((l) => [l.sku, l.name, l.price]),
    [],
    ["Subtotal", "", inv.subtotal],
    ["Insured shipping", "", inv.shipping],
    ["Total", "", inv.total],
  ];

  const body = csvBody(rows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inv.number}.csv"`,
    },
  });
}
