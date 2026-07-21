import { NextResponse } from "next/server";
import { requireBuyerSession } from "@/lib/buyer-api-auth";
import { addSkusToCartForBuyer } from "@/lib/cart/addSkusToCart";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireBuyerSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { skus?: unknown };
  const skus = Array.isArray(body.skus)
    ? body.skus.map((s) => String(s ?? "")).filter(Boolean)
    : [];

  try {
    const result = await addSkusToCartForBuyer(session, skus);
    if ("error" in result && result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add to cart." },
      { status: 500 },
    );
  }
}
