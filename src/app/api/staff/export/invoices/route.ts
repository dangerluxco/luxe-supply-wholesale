import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { listInvoices, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { csvBody, isoDate } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Staff CSV export of invoices (incl. payment balances + fulfillment). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const invoices = await listInvoices({ limit: 1000 });
  const rows: Array<Array<string | number | null>> = [
    [
      "Invoice",
      "Buyer",
      "Company",
      "Email",
      "Items",
      "Subtotal",
      "Shipping",
      "Total",
      "Received",
      "Balance",
      "Status",
      "Issued",
      "Due",
      "Paid",
      "Fulfillment",
      "Carrier",
      "Tracking",
    ],
    ...invoices.map((inv) => [
      inv.invoiceNumber,
      inv.customerName || inv.buyerDisplayName,
      inv.customerCompany,
      inv.customerEmail,
      inv.itemCount,
      inv.subtotal,
      inv.shipping,
      inv.total,
      inv.amountPaid,
      inv.balance,
      displayInvoiceStatus(inv),
      isoDate(inv.issuedAt),
      isoDate(inv.dueDate),
      isoDate(inv.paidAt),
      inv.fulfillmentStatus,
      inv.carrier,
      inv.trackingNumber,
    ]),
  ];

  return new NextResponse(csvBody(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="luxe-invoices-${isoDate(new Date())}.csv"`,
    },
  });
}
