"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { encodeSession, homeForRole, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { authenticateStaff, staffToAppRole } from "@/lib/firestore/staff";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

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
    store.set(SESSION_COOKIE, encodeSession(staffOk.staff.id, role, "firestore"), sessionCookieOptions());
    redirect(homeForRole(role));
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.password !== password) {
    return { error: "Invalid email or password." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(user.id, user.role, "prisma"), sessionCookieOptions());

  redirect(homeForRole(user.role));
}

export async function logout() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  redirect("/wholesaleportal/sign-in");
}
