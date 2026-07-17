import { NextResponse } from "next/server";
import {
  encodeSession,
  homeForRole,
  publicOrigin,
  sessionCookieNameForRole,
  sessionCookieOptions,
  sessionMaxAgeFromForm,
} from "@/lib/auth-session";
import { authenticateStaff, staffToAppRole } from "@/lib/firestore/staff";
import { prisma } from "@/lib/db";
import { formField } from "@/lib/form";

export const dynamic = "force-dynamic";

function loginRedirect(path: string, request: Request) {
  return NextResponse.redirect(new URL(path, publicOrigin(request)), 303);
}

function isAuthInfraError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || "");
  return /invalid_grant|invalid_rapt|Getting metadata|UNAUTHENTICATED|permission-denied|ECONNREFUSED|ENOTFOUND|unavailable/i.test(
    msg,
  );
}

/** GET should never stay on /api/login — send staff to the sign-in page. */
export async function GET(request: Request) {
  return loginRedirect("/wholesaleportal/sign-in", request);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = formField(form, "email").trim().toLowerCase();
  const password = formField(form, "password");
  const cookieOpts = sessionCookieOptions(sessionMaxAgeFromForm(form));

  let staffOk: Awaited<ReturnType<typeof authenticateStaff>> | null = null;
  let firestoreDown = false;
  try {
    staffOk = await authenticateStaff(email, password);
  } catch (err) {
    firestoreDown = isAuthInfraError(err);
    console.warn(
      "[api/login] Firestore staff auth unavailable:",
      err instanceof Error ? err.message : err,
    );
  }

  if (staffOk?.ok) {
    const role = staffToAppRole(staffOk.staff);
    const res = loginRedirect(homeForRole(role), request);
    res.cookies.set(
      sessionCookieNameForRole(role),
      encodeSession(staffOk.staff.id, role, "firestore"),
      cookieOpts,
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.password === password) {
      const res = loginRedirect(homeForRole(user.role), request);
      res.cookies.set(
        sessionCookieNameForRole(user.role),
        encodeSession(user.id, user.role, "prisma"),
        cookieOpts,
      );
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  } catch (err) {
    console.warn("[api/login] Prisma fallback unavailable:", err instanceof Error ? err.message : err);
  }

  const message = firestoreDown
    ? "Sign-in temporarily unavailable (server credentials). Try again in a moment, or ask an admin to refresh local Google auth."
    : "Invalid email or password.";

  const res = NextResponse.redirect(
    new URL(
      `/wholesaleportal/sign-in?error=${encodeURIComponent(message)}`,
      publicOrigin(request),
    ),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
