import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { createBuyer, markBuyerEmailSent } from "@/lib/firestore/buyers";
import { sendBuyerInviteEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, string>;
  try {
    const { buyer, temporaryPassword } = await createBuyer({
      email: String(body.email || ""),
      username: String(body.username || ""),
      displayName: String(body.displayName || ""),
      company: String(body.company || ""),
      phone: String(body.phone || ""),
      password: String(body.password || ""),
      createdBy: session.email,
    });

    let emailSent = false;
    if (buyer.email) {
      try {
        emailSent = await sendBuyerInviteEmail({
          email: buyer.email,
          username: buyer.username,
          temporaryPassword,
        });
        if (emailSent) await markBuyerEmailSent(buyer.id);
      } catch (err) {
        console.warn(
          "[staff/buyers/invite] email failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: emailSent
        ? `Buyer @${buyer.username} created and invite emailed.`
        : `Buyer @${buyer.username} created.` +
          (buyer.email
            ? " Email not sent — copy the temporary password below."
            : " No email on file — copy the temporary password below."),
      username: buyer.username,
      temporaryPassword,
      emailSent,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create buyer." },
      { status: 400 },
    );
  }
}
