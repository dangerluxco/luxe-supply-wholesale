import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { csvBody, isoDate } from "@/lib/csv";

// All-invoices CSV export for the signed-in account (one row per invoice).
export async function GET() {
  const session = await getSession();
  if (!session?.accountId) return new Response("Unauthorized", { status: 401 });

  const invoices = await prisma.invoice.findMany({
    where: { accountId: session.accountId },
    orderBy: { issuedAt: "desc" },
  });

  const header = [
    "Invoice",
    "Status",
    "PO Number",
    "Terms",
    "Issued",
    "Due",
    "Paid",
    "Subtotal",
    "Shipping",
    "Total",
    "Pieces",
  ];
  const rows = invoices.map((inv) => {
    const line: { name: string }[] = JSON.parse(inv.lineItems);
    return [
      inv.number,
      inv.status,
      inv.poNumber ?? "",
      inv.terms,
      isoDate(inv.issuedAt),
      isoDate(inv.dueDate),
      isoDate(inv.paidAt),
      inv.subtotal,
      inv.shipping,
      inv.total,
      line.map((l) => l.name).join("; "),
    ];
  });

  const body = csvBody([header, ...rows]);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="luxe-invoices.csv"`,
    },
  });
}
