import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { addCurationItem } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

type Body = {
  sku?: string;
  title?: string;
  brand?: string;
  condition?: string;
  cost?: number | null;
  price?: number;
  imageUrl?: string | null;
  imageUrls?: string[];
};

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.sku) return NextResponse.json({ error: "Missing SKU." }, { status: 400 });

  try {
    const result = await addCurationItem(token, {
      sku: body.sku,
      title: body.title,
      brand: body.brand,
      condition: body.condition,
      cost: body.cost,
      price: Number(body.price || 0),
      imageUrl: body.imageUrl,
      imageUrls: body.imageUrls,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add item." },
      { status: 400 },
    );
  }
}
