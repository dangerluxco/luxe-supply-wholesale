import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createStaff, markStaffEmailSent } from "@/lib/firestore/staff";
import { sendStaffInviteEmail } from "@/lib/notify";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== ROLE.MANAGER || session.source !== "firestore") {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    displayName?: string;
    password?: string;
    isAdmin?: boolean;
    sendEmail?: boolean;
  };

  try {
    const sendEmailWanted = body.sendEmail !== false;
    const { staff, temporaryPassword } = await createStaff({
      email: String(body.email || ""),
      displayName: String(body.displayName || ""),
      password: String(body.password || ""),
      isAdmin: !!body.isAdmin,
      invitedBy: session.email,
    });

    let emailSent = false;
    if (sendEmailWanted) {
      try {
        emailSent = await sendStaffInviteEmail({
          email: staff.email,
          temporaryPassword,
        });
        if (emailSent) await markStaffEmailSent(staff.id);
      } catch (err) {
        console.warn(
          "[staff/members/invite] email failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    await logAudit({
      actor: session,
      action: "staff.invite",
      entity: "staff",
      entityId: staff.id,
      payload: { email: staff.email, isAdmin: staff.isAdmin },
    });

    let message = `Staff ${staff.displayName} created.`;
    if (emailSent) message += " Invite email sent.";
    else if (sendEmailWanted) message += " Email could not be sent — share the password manually.";

    return NextResponse.json({
      ok: true,
      message,
      email: staff.email,
      temporaryPassword,
      emailSent,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not invite staff." },
      { status: 400 },
    );
  }
}
