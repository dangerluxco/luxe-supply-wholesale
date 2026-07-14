"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { createBuyer } from "@/lib/firestore/buyers";

/**
 * Thin server-action entry for inviting a buyer.
 * Kept off portal.ts so InviteBuyerForm’s client import graph does not
 * share a mega action module with other soft-nav pages in the rep console.
 */
export async function inviteBuyer(
  _prev:
    | { error?: string; message?: string; username?: string; temporaryPassword?: string }
    | undefined,
  formData: FormData,
) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER) ||
    session.source !== "firestore"
  ) {
    return { error: "Staff session required." };
  }

  try {
    const { buyer, temporaryPassword } = await createBuyer({
      email: String(formData.get("email") || ""),
      username: String(formData.get("username") || ""),
      displayName: String(formData.get("displayName") || ""),
      company: String(formData.get("company") || ""),
      phone: String(formData.get("phone") || ""),
      password: String(formData.get("password") || ""),
      createdBy: session.email,
    });
    revalidatePath("/wholesaleportal/rep/clients");
    return {
      ok: true,
      message: `Buyer @${buyer.username} created.`,
      username: buyer.username,
      temporaryPassword,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create buyer." };
  }
}
