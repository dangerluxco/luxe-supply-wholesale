import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { createBuyer, markBuyerEmailSent } from "@/lib/firestore/buyers";
import {
  getRegistrationRequestById,
  markRegistrationApproved,
} from "@/lib/firestore/registrationRequests";
import { sendBuyerInviteEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id: applicationId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { reviewNote?: string };
  const app = await getRegistrationRequestById(applicationId);
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (app.status !== "pending") {
    return NextResponse.json({ error: "Application is no longer pending." }, { status: 400 });
  }

  try {
    const displayName = `${app.firstName} ${app.lastName}`.trim();
    const { buyer, temporaryPassword } = await createBuyer({
      email: app.email,
      displayName,
      company: app.company,
      ein: app.businessTaxId,
      phone: app.phone,
      createdBy: session.email,
    });

    await markRegistrationApproved({
      id: app.id,
      reviewedBy: session.email,
      buyerId: buyer.id,
      temporaryPassword,
      reviewNote: body.reviewNote,
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
          "[staff/applications/approve] email failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      username: buyer.username,
      temporaryPassword,
      emailSent,
      message: emailSent
        ? "Approved — login emailed to the buyer."
        : "Approved — copy the temporary password below (email not sent).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not approve application." },
      { status: 400 },
    );
  }
}
