import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { listBuyers } from "@/lib/firestore/buyers";
import { csvBody, isoDate } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Staff CSV export of the client list. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const buyers = await listBuyers();
  const rows: Array<Array<string | number | null>> = [
    [
      "Username",
      "Display name",
      "Email",
      "Company",
      "Phone",
      "City",
      "State",
      "Status",
      "Payment tier",
      "Payment terms",
      "Created",
      "Last login",
    ],
    ...buyers.map((b) => [
      b.username,
      b.displayName,
      b.email,
      b.company,
      b.phone,
      b.city,
      b.state,
      b.status,
      b.paymentTier,
      b.paymentTerms,
      isoDate(b.createdAt),
      isoDate(b.lastLoginAt),
    ]),
  ];

  return new NextResponse(csvBody(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="luxe-clients-${isoDate(new Date())}.csv"`,
    },
  });
}
