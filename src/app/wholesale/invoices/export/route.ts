import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listInvoicesForBuyer, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { csvBody, isoDate } from "@/lib/csv";

// All-invoices CSV export for the signed-in buyer (one row per invoice).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) return new Response("Unauthorized", { status: 401 });

  const invoices = session.username ? await listInvoicesForBuyer(session.username) : [];

  const header = [
    "Invoice",
    "Status",
    "Fulfillment",
    "Terms",
    "Issued",
    "Due",
    "Paid",
    "Subtotal",
    "Shipping",
    "Total",
    "Pieces",
  ];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    displayInvoiceStatus(inv),
    inv.fulfillmentStatus,
    inv.terms,
    isoDate(inv.issuedAt),
    isoDate(inv.dueDate),
    isoDate(inv.paidAt),
    inv.subtotal,
    inv.shipping,
    inv.total,
    inv.items.map((l) => l.title).join("; "),
  ]);

  const body = csvBody([header, ...rows]);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="luxe-invoices.csv"`,
    },
  });
}
