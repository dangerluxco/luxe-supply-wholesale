"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  encodeSession,
  homeForRole,
  sessionCookieOptions,
  sessionCookieNameForRole,
  sessionMaxAgeFromForm,
} from "@/lib/auth";
import {
  BUYER_SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  FULFILLMENT_SESSION_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth-session";
import { authenticateStaff, staffToAppRole } from "@/lib/firestore/staff";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const cookieOpts = sessionCookieOptions(sessionMaxAgeFromForm(formData));

  // Keep redirect() outside try/catch — Next throws NEXT_REDIRECT on success.
  let staffOk: Awaited<ReturnType<typeof authenticateStaff>> | null = null;
  try {
    staffOk = await authenticateStaff(email, password);
  } catch (err) {
    console.warn("[login] Firestore staff auth unavailable:", err instanceof Error ? err.message : err);
  }

  if (staffOk?.ok) {
    const role = staffToAppRole(staffOk.staff);
    const store = await cookies();
    store.set(sessionCookieNameForRole(role), encodeSession(staffOk.staff.id, role, "firestore"), cookieOpts);
    redirect(homeForRole(role));
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.password !== password) {
    return { error: "Invalid email or password." };
  }

  const store = await cookies();
  store.set(sessionCookieNameForRole(user.role), encodeSession(user.id, user.role, "prisma"), cookieOpts);

  redirect(homeForRole(user.role));
}

/** Clears every area's session cookie — safe to call regardless of which area signed you in. */
export async function logout() {
  const store = await cookies();
  const clearOpts = { ...sessionCookieOptions(0), maxAge: 0 };
  store.set(BUYER_SESSION_COOKIE, "", clearOpts);
  store.set(STAFF_SESSION_COOKIE, "", clearOpts);
  store.set(FULFILLMENT_SESSION_COOKIE, "", clearOpts);
  store.set(SESSION_COOKIE, "", clearOpts);
  redirect("/wholesaleportal/sign-in");
}
