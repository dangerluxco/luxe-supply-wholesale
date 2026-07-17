"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { updateStaff } from "@/lib/firestore/staff";

function requireAdmin() {
  return getSession().then((session) => {
    if (!session || session.role !== ROLE.MANAGER || session.source !== "firestore") {
      return null;
    }
    return session;
  });
}

/**
 * Thin server-action entries for staff admin mutations.
 * Kept separate from portal.ts / invite-staff so StaffMemberActions’ client
 * import graph does not share mega action modules (soft-nav stub collisions).
 */
export async function setStaffAdmin(
  _prev: { error?: string; message?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  const session = await requireAdmin();
  if (!session) return { error: "Admin session required." };

  const staffId = String(formData.get("staffId") || "").trim();
  if (!staffId) return { error: "Missing staff id." };

  const isAdmin = String(formData.get("isAdmin") || "") === "true";

  try {
    const staff = await updateStaff(staffId, {
      isAdmin,
      updatedBy: session.email,
    });
    revalidatePath("/wholesaleportal/rep/staff");
    return {
      ok: true,
      message: staff.isAdmin ? "Marked as admin." : "Admin removed.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update admin." };
  }
}

export async function setStaffStatus(
  _prev: { error?: string; message?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  const session = await requireAdmin();
  if (!session) return { error: "Admin session required." };

  const staffId = String(formData.get("staffId") || "").trim();
  if (!staffId) return { error: "Missing staff id." };
  if (staffId === session.id) return { error: "You cannot disable your own account." };

  const status = String(formData.get("status") || "").toLowerCase();
  if (status !== "active" && status !== "disabled") {
    return { error: "Invalid status." };
  }

  try {
    const staff = await updateStaff(staffId, {
      status,
      updatedBy: session.email,
    });
    revalidatePath("/wholesaleportal/rep/staff");
    return {
      ok: true,
      message: staff.status === "disabled" ? "Account disabled." : "Account re-enabled.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update status." };
  }
}
