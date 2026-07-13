"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { saveQuoteSettings } from "@/lib/firestore/settings";

export async function saveThresholdSettings(
  _prev: { error?: string; message?: string; ok?: boolean } | undefined,
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

  const minItemCount = Number(formData.get("minItemCount") || 0);
  const minCartTotal = Number(formData.get("minCartTotal") || 0);
  const notifyEmailsRaw = String(formData.get("notifyEmails") || "");
  const notifyEmails = notifyEmailsRaw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  try {
    await saveQuoteSettings({
      minItemCount: Number.isFinite(minItemCount) ? minItemCount : 0,
      minCartTotal: Number.isFinite(minCartTotal) ? minCartTotal : 0,
      notifyEmails,
    });
    revalidatePath("/wholesaleportal/rep/settings");
    return { ok: true, message: "Settings saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save settings." };
  }
}
