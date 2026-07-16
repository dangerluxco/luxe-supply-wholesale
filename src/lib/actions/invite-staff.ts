"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createStaff, markStaffEmailSent } from "@/lib/firestore/staff";
import { sendStaffInviteEmail } from "@/lib/notify";

/**
 * Thin server-action entry for inviting staff.
 * Kept off portal.ts so InviteStaffForm’s client import graph stays isolated
 * (same soft-nav collision pattern as invite-buyer / buyer-cart-limits).
 */
export async function inviteStaff(
  _prev:
    | {
        error?: string;
        message?: string;
        ok?: boolean;
        email?: string;
        temporaryPassword?: string;
        emailSent?: boolean;
      }
    | undefined,
  formData: FormData,
) {
  const session = await getSession();
  if (!session || session.role !== ROLE.MANAGER || session.source !== "firestore") {
    return { error: "Admin session required." };
  }

  try {
    const sendEmailWanted = formData.get("sendEmail") === "on" || formData.get("sendEmail") === "true";
    const { staff, temporaryPassword } = await createStaff({
      email: String(formData.get("email") || ""),
      displayName: String(formData.get("displayName") || ""),
      password: String(formData.get("password") || ""),
      isAdmin: formData.get("isAdmin") === "on" || formData.get("isAdmin") === "true",
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
        console.warn("[inviteStaff] email failed:", err instanceof Error ? err.message : err);
      }
    }

    revalidatePath("/wholesaleportal/rep/staff");
    let message = `Staff ${staff.displayName} created.`;
    if (emailSent) message += " Invite email sent.";
    else if (sendEmailWanted) message += " Email could not be sent — share the password manually.";

    return {
      ok: true,
      message,
      email: staff.email,
      temporaryPassword,
      emailSent,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not invite staff." };
  }
}
