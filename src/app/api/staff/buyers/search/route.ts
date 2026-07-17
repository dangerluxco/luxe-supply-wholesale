import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { searchBuyers } from "@/lib/firestore/buyers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    const buyers = await searchBuyers(q);
    return NextResponse.json({
      ok: true,
      buyers: buyers.map((b) => ({
        id: b.id,
        displayName: b.displayName,
        username: b.username,
        email: b.email,
        company: b.company,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not search buyers." },
      { status: 400 },
    );
  }
}
