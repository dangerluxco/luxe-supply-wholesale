import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { updateBuyerAccountDetails, type BuyerAccountDetailsInput } from "@/lib/firestore/buyers";

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

  const body = (await request.json().catch(() => ({}))) as BuyerAccountDetailsInput;

  try {
    const buyer = await updateBuyerAccountDetails(buyerId.trim(), body);
    return NextResponse.json({ ok: true, buyer, message: "Account details updated." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update account details." },
      { status: 400 },
    );
  }
}
