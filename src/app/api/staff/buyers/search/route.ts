import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { listBuyers, searchBuyers } from "@/lib/firestore/buyers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const all = url.searchParams.get("all") === "1";
  try {
    const buyers = (
      all
        ? (await listBuyers()).sort((a, b) =>
            String(a.displayName || a.username || "").localeCompare(
              String(b.displayName || b.username || ""),
              undefined,
              { sensitivity: "base" },
            ),
          )
        : await searchBuyers(q)
    ).filter((b) => b.status !== "disabled");
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
