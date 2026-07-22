import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { updateBuyerCartLimits } from "@/lib/firestore/buyers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id: buyerId } = await ctx.params;
  if (!buyerId?.trim()) {
    return NextResponse.json({ error: "Missing buyer id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    maxCartItems?: number;
    maxCartValue?: number;
  };

  try {
    const buyer = await updateBuyerCartLimits(buyerId.trim(), {
      maxCartItems: Number(body.maxCartItems || 0),
      maxCartValue: Number(body.maxCartValue || 0),
    });
    await logAudit({
      actor: session,
      action: "buyer.cart_limits",
      entity: "buyer",
      entityId: buyerId.trim(),
      payload: { maxCartItems: buyer.maxCartItems, maxCartValue: buyer.maxCartValue },
    });
    return NextResponse.json({
      ok: true,
      message: `Limits updated: ${buyer.maxCartItems} items / $${buyer.maxCartValue.toLocaleString("en-US")}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update limits." },
      { status: 400 },
    );
  }
}
