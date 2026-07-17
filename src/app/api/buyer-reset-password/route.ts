import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth-session";
import { setBuyerPasswordForce } from "@/lib/firestore/buyers";
import { consumePasswordResetToken, getValidPasswordResetToken } from "@/lib/firestore/passwordResets";
import { formField } from "@/lib/form";

export const dynamic = "force-dynamic";

function redirectWithError(request: Request, token: string, message: string) {
  const res = NextResponse.redirect(
    new URL(
      `/wholesale/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`,
      publicOrigin(request),
    ),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = formField(form, "token").trim();
  const password = formField(form, "password");
  const confirmPassword = formField(form, "confirmPassword");

  if (!token) {
    return redirectWithError(request, token, "Missing reset link. Request a new one.");
  }
  if (password !== confirmPassword) {
    return redirectWithError(request, token, "Passwords don't match.");
  }

  const record = await getValidPasswordResetToken(token);
  if (!record || record.role !== "buyer") {
    return redirectWithError(request, token, "This reset link has expired or was already used.");
  }

  const result = await setBuyerPasswordForce(record.accountId, password);
  if (!result.ok) {
    return redirectWithError(request, token, result.error);
  }
  await consumePasswordResetToken(record.id);

  const res = NextResponse.redirect(
    new URL(
      `/wholesale/sign-in?ok=${encodeURIComponent("Password updated — sign in with your new password.")}`,
      publicOrigin(request),
    ),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
