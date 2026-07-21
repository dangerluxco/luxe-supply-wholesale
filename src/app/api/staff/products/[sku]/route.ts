import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getProductDetailView, saveProductDetails } from "@/lib/firestore/productDetails";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ sku: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { sku } = await ctx.params;
  try {
    const product = await getProductDetailView(decodeURIComponent(sku));
    if (!product) {
      return NextResponse.json({ error: "SKU not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, product });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load product." },
      { status: 400 },
    );
  }
}

type SaveBody = {
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  era?: string;
  material?: string;
  origin?: string;
  provenance?: string;
  condition?: string;
  marks?: string;
  dimensions?: string;
  vaultLocation?: string;
  cost?: number | string | null;
  listPrice?: number | string | null;
  salePrice?: number | string | null;
  images?: string[];
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request, ctx: { params: Promise<{ sku: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { sku } = await ctx.params;
  const cleanSku = decodeURIComponent(sku).trim();
  if (!cleanSku) {
    return NextResponse.json({ error: "Missing SKU." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as SaveBody;

  const costOverride = numOrNull(body.cost);
  const listPriceOverride = numOrNull(body.listPrice);
  const salePriceOverride = numOrNull(body.salePrice);
  if (costOverride != null && costOverride < 0) {
    return NextResponse.json({ error: "Cost cannot be negative." }, { status: 400 });
  }
  if (listPriceOverride != null && listPriceOverride < 0) {
    return NextResponse.json({ error: "List price cannot be negative." }, { status: 400 });
  }
  if (salePriceOverride != null && salePriceOverride < 0) {
    return NextResponse.json({ error: "Sale price cannot be negative." }, { status: 400 });
  }

  try {
    const product = await saveProductDetails(
      cleanSku,
      {
        title: body.title ?? null,
        brand: body.brand ?? null,
        category: body.category ?? null,
        description: body.description ?? null,
        era: body.era ?? null,
        material: body.material ?? null,
        origin: body.origin ?? null,
        provenance: body.provenance ?? null,
        condition: body.condition ?? null,
        marks: body.marks ?? null,
        dimensions: body.dimensions ?? null,
        vaultLocation: body.vaultLocation ?? null,
        costOverride,
        listPriceOverride,
        salePriceOverride,
        images: Array.isArray(body.images) ? body.images : null,
      },
      session.email,
    );
    if (!product) {
      return NextResponse.json({ error: "SKU not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, product });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save product." },
      { status: 400 },
    );
  }
}
