import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { listQuotes } from "@/lib/firestore/quotes";
import { csvBody, isoDate } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Staff CSV export of order requests (all statuses). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { quotes } = await listQuotes({ status: "all", limit: 1000 });
  const rows: Array<Array<string | number | null>> = [
    [
      "Request ID",
      "Status",
      "Customer",
      "Email",
      "Company",
      "Buyer username",
      "Items",
      "Merchandise",
      "Shipping",
      "Order total",
      "Claimed by",
      "Invoice",
      "Created",
      "Updated",
    ],
    ...quotes.map((q) => [
      q.id,
      q.status,
      q.customerName || q.buyerDisplayName,
      q.customerEmail,
      q.customerCompany,
      q.portalUsername,
      q.itemCount,
      q.cartTotal,
      q.shipping,
      q.cartTotal != null ? q.cartTotal + (q.shipping || 0) : null,
      q.claimedByName || q.claimedByEmail,
      q.invoiceNumber,
      isoDate(q.createdAt),
      isoDate(q.updatedAt),
    ]),
  ];

  return new NextResponse(csvBody(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="luxe-order-requests-${isoDate(new Date())}.csv"`,
    },
  });
}
