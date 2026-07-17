import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { markStaffEmailSent, resetStaffPassword } from "@/lib/firestore/staff";
import { sendStaffPasswordResetEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Admin: generate a new temp password for a staff member and email it to them. */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== ROLE.MANAGER || session.source !== "firestore") {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const { id: staffId } = await ctx.params;
  if (!staffId?.trim()) {
    return NextResponse.json({ error: "Missing staff id." }, { status: 400 });
  }

  try {
    const { staff, temporaryPassword } = await resetStaffPassword(staffId.trim(), {
      updatedBy: session.email,
    });

    let emailSent = false;
    if (staff.email) {
      try {
        emailSent = await sendStaffPasswordResetEmail({
          email: staff.email,
          temporaryPassword,
        });
        if (emailSent) await markStaffEmailSent(staff.id);
      } catch (err) {
        console.warn(
          "[staff/members/reset-password] email failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      temporaryPassword,
      emailSent,
      email: staff.email || null,
      message: emailSent
        ? "New password generated and emailed."
        : "New password generated (email not sent — copy it below).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reset password." },
      { status: 400 },
    );
  }
}
