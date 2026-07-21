import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  withAreaSession,
} from "@/lib/auth-session";
import { requireManagerSession } from "@/lib/staff-api-auth";
import { disableStaffTotp, getStaffById } from "@/lib/firestore/staff";
import { decryptTotpSecret, verifyRecoveryCode, verifyTotpCode } from "@/lib/totp";
import { logAudit } from "@/lib/firestore/audit";
import { ROLE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Disable TOTP (requires a valid authenticator or recovery code). Re-enroll is required. */
export async function POST(request: Request) {
  const session = await requireManagerSession({ allowPendingTotp: true });
  if (!session) {
    return NextResponse.json({ error: "Manager session required." }, { status: 401 });
  }

  const staff = await getStaffById(session.id);
  if (!staff?.totpEnabled || !staff.totpSecretEnc) {
    return NextResponse.json({ error: "Two-factor authentication is not enabled." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code || "").trim();
  if (!code) {
    return NextResponse.json({ error: "Enter an authenticator or recovery code." }, { status: 400 });
  }

  let ok = false;
  try {
    ok = verifyTotpCode(decryptTotpSecret(staff.totpSecretEnc), code);
  } catch {
    return NextResponse.json({ error: "Could not verify authenticator secret." }, { status: 500 });
  }
  if (!ok && verifyRecoveryCode(code, staff.totpRecoveryHashes)) ok = true;
  if (!ok) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  try {
    await disableStaffTotp(session.id);
    await logAudit({
      actor: session,
      action: "staff.2fa.disable",
      entity: "staff",
      entityId: session.id,
    });

    const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
    const res = NextResponse.json({
      ok: true,
      redirect: "/wholesaleportal/security/2fa?mode=enroll",
    });
    res.cookies.set(
      SESSION_COOKIE,
      withAreaSession(
        existingRaw,
        "staff",
        encodeSession(session.id, ROLE.MANAGER, "firestore"),
      ),
      sessionCookieOptions(),
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not disable 2FA." },
      { status: 400 },
    );
  }
}
