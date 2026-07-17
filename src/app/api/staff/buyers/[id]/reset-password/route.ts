import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { markBuyerEmailSent, resetBuyerPassword } from "@/lib/firestore/buyers";
import { sendBuyerPasswordResetEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Staff: generate a new temp password for a buyer and email it when possible. */
export async function POST(
  _request: Request,
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

  try {
    const { buyer, temporaryPassword } = await resetBuyerPassword(buyerId.trim(), {
      updatedBy: session.email,
    });

    let emailSent = false;
    if (buyer.email) {
      try {
        emailSent = await sendBuyerPasswordResetEmail({
          email: buyer.email,
          username: buyer.username,
          temporaryPassword,
        });
        if (emailSent) await markBuyerEmailSent(buyer.id);
      } catch (err) {
        console.warn(
          "[staff/buyers/reset-password] email failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      temporaryPassword,
      emailSent,
      email: buyer.email || null,
      username: buyer.username,
      message: emailSent
        ? "New password generated and emailed to the buyer."
        : buyer.email
          ? "New password generated (email not sent — copy it below)."
          : "New password generated (no email on file — copy it below).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reset password." },
      { status: 400 },
    );
  }
}
