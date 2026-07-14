"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { changeBuyerPassword, updateBuyerProfile } from "@/lib/firestore/buyers";

async function requireBuyer() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER || session.source !== "firestore") {
    throw new Error("Sign in required.");
  }
  return session;
}

export async function updateAccountProfile(
  _prev: { error?: string; message?: string } | undefined,
  formData: FormData,
) {
  try {
    const session = await requireBuyer();
    await updateBuyerProfile(session.id, {
      displayName: String(formData.get("displayName") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      company: String(formData.get("company") || ""),
    });
    revalidatePath("/wholesale/account");
    return { ok: true, message: "Account details saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save account details." };
  }
}

export async function changeAccountPassword(
  _prev: { error?: string; message?: string } | undefined,
  formData: FormData,
) {
  try {
    const session = await requireBuyer();
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (!currentPassword || !newPassword) return { error: "All fields are required." };
    if (newPassword !== confirmPassword) return { error: "New passwords don't match." };

    const res = await changeBuyerPassword(session.id, currentPassword, newPassword);
    if (!res.ok) return { error: res.error };

    return { ok: true, message: "Password updated." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update password." };
  }
}
