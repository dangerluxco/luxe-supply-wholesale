import { NextResponse } from "next/server";
import {
  encodeSession,
  homeForRole,
  publicOrigin,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth-session";
import { authenticateBuyer } from "@/lib/firestore/buyers";
import { ROLE } from "@/lib/constants";
import { formField } from "@/lib/form";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = (formField(form, "username") || formField(form, "email")).trim();
  const password = formField(form, "password");

  let auth: Awaited<ReturnType<typeof authenticateBuyer>> | null = null;
  try {
    auth = await authenticateBuyer(username, password);
  } catch (err) {
    console.warn("[api/buyer-login] Firestore unavailable:", err instanceof Error ? err.message : err);
  }

  if (auth?.ok) {
    const nextRaw = formField(form, "next").trim();
    const next =
      nextRaw.startsWith("/wholesale") && !nextRaw.startsWith("/wholesaleportal")
        ? nextRaw
        : homeForRole(ROLE.BUYER);
    const res = NextResponse.redirect(new URL(next, publicOrigin(request)), 303);
    res.cookies.set(
      SESSION_COOKIE,
      encodeSession(auth.buyer.id, ROLE.BUYER, "firestore", auth.buyer.username),
      sessionCookieOptions(),
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const nextRaw = formField(form, "next").trim();
  const nextQs =
    nextRaw.startsWith("/wholesale") && !nextRaw.startsWith("/wholesaleportal")
      ? `&next=${encodeURIComponent(nextRaw)}`
      : "";

  const res = NextResponse.redirect(
    new URL(
      `/wholesale/sign-in?error=${encodeURIComponent("Invalid username or password.")}${nextQs}`,
      publicOrigin(request),
    ),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
