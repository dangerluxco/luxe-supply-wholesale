import { NextResponse } from "next/server";
import { requireManagerSession } from "@/lib/staff-api-auth";
import {
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpAuthUrl,
} from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * Start TOTP enrollment — returns otpauth URL + recovery codes (shown once).
 * Secret is not persisted until /enable succeeds with a valid code.
 */
export async function POST() {
  const session = await requireManagerSession({ allowPendingTotp: true });
  if (!session) {
    return NextResponse.json({ error: "Manager session required." }, { status: 401 });
  }

  const secret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes(8);
  const otpauthUrl = totpAuthUrl({ secret, email: session.email });

  return NextResponse.json({
    ok: true,
    secret,
    secretEnc: encryptTotpSecret(secret),
    otpauthUrl,
    recoveryCodes,
    recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUrl)}`,
  });
}
