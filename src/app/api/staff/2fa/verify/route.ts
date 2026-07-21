import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  withAreaSession,
} from "@/lib/auth-session";
import { requireManagerSession } from "@/lib/staff-api-auth";
import { getStaffById, replaceStaffRecoveryHashes } from "@/lib/firestore/staff";
import { decryptTotpSecret, verifyRecoveryCode, verifyTotpCode } from "@/lib/totp";
import { ROLE } from "@/lib/constants";
import { homeForRole } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireManagerSession({ allowPendingTotp: true });
  if (!session) {
    return NextResponse.json({ error: "Manager session required." }, { status: 401 });
  }

  const staff = await getStaffById(session.id);
  if (!staff?.totpEnabled || !staff.totpSecretEnc) {
    return NextResponse.json(
      { error: "Two-factor authentication is not enrolled.", redirect: "/wholesaleportal/security/2fa?mode=enroll" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code || "").trim();
  if (!code) {
    return NextResponse.json({ error: "Enter a code from your authenticator app." }, { status: 400 });
  }

  let ok = false;
  try {
    const secret = decryptTotpSecret(staff.totpSecretEnc);
    ok = verifyTotpCode(secret, code);
  } catch {
    return NextResponse.json({ error: "Could not verify authenticator secret." }, { status: 500 });
  }

  if (!ok) {
    const matched = verifyRecoveryCode(code, staff.totpRecoveryHashes);
    if (matched) {
      ok = true;
      await replaceStaffRecoveryHashes(
        staff.id,
        staff.totpRecoveryHashes.filter((h) => h !== matched),
      );
    }
  }

  if (!ok) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = NextResponse.json({
    ok: true,
    redirect: homeForRole(ROLE.MANAGER),
  });
  res.cookies.set(
    SESSION_COOKIE,
    withAreaSession(
      existingRaw,
      "staff",
      encodeSession(session.id, ROLE.MANAGER, "firestore", { totpVerified: true }),
    ),
    sessionCookieOptions(),
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
