import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(): Buffer {
  const secret =
    String(process.env.TOTP_ENCRYPTION_KEY || process.env.AUTH_SECRET || "").trim() ||
    "dev-only-totp-key-change-me";
  return scryptSync(secret, "luxe-totp-v1", 32);
}

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)]!;
  }
  return out;
}

export function encryptTotpSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptTotpSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function base32ToBuffer(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of cleaned) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secretBase32: string, codeRaw: string, window = 1): boolean {
  const code = String(codeRaw || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32ToBuffer(secretBase32);
  const timestep = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w += 1) {
    const expected = hotp(secret, timestep + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function totpAuthUrl(opts: { secret: string; email: string; issuer?: string }): string {
  const issuer = encodeURIComponent(opts.issuer || "Luxe Supply");
  const label = encodeURIComponent(`Luxe Supply:${opts.email}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(randomBytes(4).toString("hex"));
  }
  return out;
}

export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", encryptionKey()).update(String(code).trim().toLowerCase()).digest("hex");
}

export function verifyRecoveryCode(code: string, hashes: string[]): string | null {
  const target = hashRecoveryCode(code);
  for (const h of hashes) {
    const a = Buffer.from(h);
    const b = Buffer.from(target);
    if (a.length === b.length && timingSafeEqual(a, b)) return h;
  }
  return null;
}
