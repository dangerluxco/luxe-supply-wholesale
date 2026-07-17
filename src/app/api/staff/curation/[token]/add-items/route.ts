import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { addCurationItems } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

type Item = {
  sku: string;
  title?: string;
  brand?: string;
  condition?: string;
  cost?: number | null;
  price: number;
  imageUrl?: string | null;
  imageUrls?: string[];
};

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { items?: Item[] };
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Add at least one priced item." }, { status: 400 });
  }

  try {
    const result = await addCurationItems(token, body.items);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add items." },
      { status: 400 },
    );
  }
}
