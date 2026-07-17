import { randomBytes, createHash } from "crypto";
import { getDb } from "./admin";

export type ResetRole = "buyer" | "staff";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const COLLECTION = "salesPortalPasswordResets";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Creates a single-use reset token for the given account. Returns the raw token to embed in the email link. */
export async function createPasswordResetToken(opts: {
  role: ResetRole;
  accountId: string;
  email: string;
}): Promise<{ token: string }> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await getDb()
    .collection(COLLECTION)
    .add({
      role: opts.role,
      accountId: opts.accountId,
      email: String(opts.email || "").toLowerCase(),
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      usedAt: null,
    });
  return { token };
}

/** Looks up a still-valid (unused, unexpired) token without consuming it. */
export async function getValidPasswordResetToken(
  rawToken: string,
): Promise<{ id: string; role: ResetRole; accountId: string; email: string } | null> {
  const token = String(rawToken || "").trim();
  if (!token) return null;

  const snap = await getDb()
    .collection(COLLECTION)
    .where("tokenHash", "==", hashToken(token))
    .limit(1)
    .get();
  if (snap.empty) return null;

  const doc = snap.docs[0]!;
  const d = doc.data() || {};
  if (d.usedAt) return null;

  const expiresAt = d.expiresAt;
  const expiresMs =
    expiresAt && typeof expiresAt.toDate === "function"
      ? expiresAt.toDate().getTime()
      : expiresAt instanceof Date
        ? expiresAt.getTime()
        : 0;
  if (!expiresMs || expiresMs < Date.now()) return null;

  return {
    id: doc.id,
    role: (d.role === "staff" ? "staff" : "buyer") as ResetRole,
    accountId: String(d.accountId || ""),
    email: String(d.email || ""),
  };
}

/** Marks a token used so it can't be replayed. Call only after the new password is successfully set. */
export async function consumePasswordResetToken(id: string): Promise<void> {
  if (!id) return;
  await getDb().collection(COLLECTION).doc(id).update({ usedAt: new Date() });
}
