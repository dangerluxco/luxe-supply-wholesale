"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  areaForRole,
  encodeSession,
  homeForRole,
  sessionCookieOptions,
  sessionMaxAgeFromForm,
} from "@/lib/auth";
import { SESSION_COOKIE, withAreaSession, withoutAreaSession } from "@/lib/auth-session";
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

  const store = await cookies();
  const existingRaw = store.get(SESSION_COOKIE)?.value;

  if (staffOk?.ok) {
    const role = staffToAppRole(staffOk.staff);
    store.set(
      SESSION_COOKIE,
      withAreaSession(existingRaw, areaForRole(role), encodeSession(staffOk.staff.id, role, "firestore")),
      cookieOpts,
    );
    redirect(homeForRole(role));
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.password !== password) {
    return { error: "Invalid email or password." };
  }

  store.set(
    SESSION_COOKIE,
    withAreaSession(existingRaw, areaForRole(user.role), encodeSession(user.id, user.role, "prisma")),
    cookieOpts,
  );

  redirect(homeForRole(user.role));
}

/** Clears the fulfillment area's session — other areas packed into the shared cookie stay signed in. */
export async function logout() {
  const store = await cookies();
  const existingRaw = store.get(SESSION_COOKIE)?.value;
  store.set(SESSION_COOKIE, withoutAreaSession(existingRaw, "fulfillment"), sessionCookieOptions());
  redirect("/wholesaleportal/sign-in");
}
