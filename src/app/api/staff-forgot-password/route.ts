import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth-session";
import { findStaffByEmail } from "@/lib/firestore/staff";
import { createPasswordResetToken } from "@/lib/firestore/passwordResets";
import { sendPasswordResetLinkEmail, staffPortalOrigin } from "@/lib/notify";
import { formField } from "@/lib/form";

export const dynamic = "force-dynamic";

// Always responds success (regardless of match) so this endpoint can't be used to
// enumerate staff accounts.
export async function POST(request: Request) {
  const form = await request.formData();
  const email = formField(form, "email").trim();
  const origin = staffPortalOrigin() || publicOrigin(request);

  try {
    const staff = email ? await findStaffByEmail(email) : null;
    if (staff && staff.status !== "disabled" && staff.email) {
      const { token } = await createPasswordResetToken({
        role: "staff",
        accountId: staff.id,
        email: staff.email,
      });
      const resetUrl = `${origin}/wholesaleportal/reset-password?token=${token}`;
      const sent = await sendPasswordResetLinkEmail({
        email: staff.email,
        resetUrl,
        isStaff: true,
      });
      console.log(
        `[staff-forgot-password] staff=${staff.id} email=${staff.email} sent=${sent}`,
      );
    } else {
      console.log(
        `[staff-forgot-password] no send for email="${email}" ` +
          `(found=${!!staff} status=${staff?.status || "n/a"})`,
      );
    }
  } catch (err) {
    console.error(
      "[staff-forgot-password] failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const res = NextResponse.redirect(
    new URL("/wholesaleportal/forgot-password?sent=1", origin),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
