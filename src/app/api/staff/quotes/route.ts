import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { listQuotes } from "@/lib/firestore/quotes";

export const dynamic = "force-dynamic";

/** Statuses that represent a deal being actively worked — the dashboard's
 * default "open orders" view (explicitly excludes invoiced/closed/declined/timed-out). */
const OPEN_ORDER_STATUSES = new Set(["open", "contacted"]);

export type DashboardOrderRow = {
  id: string;
  client: string;
  email: string;
  company: string;
  portalUsername: string;
  itemCount: number;
  total: number;
  status: string;
  claimedByName: string | null;
  createdAt: string | null;
};

/** Lightweight, poll-friendly list of order requests for the live staff dashboard. */
export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "open_orders").toLowerCase();

  try {
    const { quotes } = await listQuotes({ status: "all", limit: 100 });
    const filtered =
      status === "all"
        ? quotes
        : status === "open_orders"
          ? quotes.filter((q) => OPEN_ORDER_STATUSES.has(q.status))
          : quotes.filter((q) => q.status === status);

    const rows: DashboardOrderRow[] = filtered.map((q) => ({
      id: q.id,
      client: q.customerName || q.buyerDisplayName || q.customerEmail || "—",
      email: q.customerEmail || "",
      company: q.customerCompany || "",
      portalUsername: q.portalUsername || "",
      itemCount: q.itemCount || 0,
      total: Math.round((q.cartTotal || 0) + (q.shipping || 0)),
      status: q.status,
      claimedByName: q.claimedByName || null,
      createdAt: q.createdAt,
    }));

    return NextResponse.json({ ok: true, rows, revision: `${rows.length}:${rows[0]?.id || ""}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load orders." },
      { status: 400 },
    );
  }
}
