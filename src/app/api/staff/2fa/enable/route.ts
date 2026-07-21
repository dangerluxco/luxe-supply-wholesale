import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  withAreaSession,
} from "@/lib/auth-session";
import { requireManagerSession } from "@/lib/staff-api-auth";
import { enableStaffTotp } from "@/lib/firestore/staff";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";
import { logAudit } from "@/lib/firestore/audit";
import { ROLE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireManagerSession({ allowPendingTotp: true });
  if (!session) {
    return NextResponse.json({ error: "Manager session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    secretEnc?: string;
    code?: string;
    recoveryHashes?: string[];
  };

  const secretEnc = String(body.secretEnc || "").trim();
  const code = String(body.code || "").trim();
  const recoveryHashes = Array.isArray(body.recoveryHashes)
    ? body.recoveryHashes.map((h) => String(h)).filter(Boolean)
    : [];

  if (!secretEnc || !code) {
    return NextResponse.json({ error: "Authenticator code is required." }, { status: 400 });
  }
  if (recoveryHashes.length < 4) {
    return NextResponse.json({ error: "Recovery codes missing — restart setup." }, { status: 400 });
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(secretEnc);
  } catch {
    return NextResponse.json({ error: "Invalid setup payload. Restart setup." }, { status: 400 });
  }

  if (!verifyTotpCode(secret, code)) {
    return NextResponse.json({ error: "Invalid authenticator code." }, { status: 400 });
  }

  try {
    await enableStaffTotp(session.id, { secretEnc, recoveryHashes });
    await logAudit({
      actor: session,
      action: "staff.2fa.enable",
      entity: "staff",
      entityId: session.id,
    });

    const existingRaw = (await cookies()).get(SESSION_COOKIE)?.value;
    const res = NextResponse.json({ ok: true, message: "Two-factor authentication enabled." });
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not enable 2FA." },
      { status: 400 },
    );
  }
}
