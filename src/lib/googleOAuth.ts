import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { OAuth2Client } from "google-auth-library";

/**
 * Google OAuth for staff + buyer sign-in — Auth.js-style authorization-code
 * redirect (same pattern as hq.eelolive.com), not the GIS One Tap button.
 *
 * Why redirect (not GIS): Firebase Hosting only forwards a `__session` cookie,
 * so we can't stash a PKCE verifier in a side cookie. A signed `state` param
 * carries area/next/remember through the round-trip; the client secret makes
 * the code exchange a confidential-client flow (no PKCE required).
 *
 * Client IDs are public; the CLIENT SECRET stays server-only.
 */

export function googleOAuthClientId(): string {
  return String(
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
      process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
      "",
  ).trim();
}

export function googleOAuthClientSecret(): string {
  return String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
}

/** Optional Google `hd=` lock for staff (e.g. luxesupply.co). Buyers unrestricted. */
export function googleOAuthStaffHostedDomain(): string {
  return String(process.env.GOOGLE_OAUTH_HD_STAFF || "").trim().toLowerCase();
}

export function googleOAuthConfigured(): boolean {
  return Boolean(googleOAuthClientId() && googleOAuthClientSecret());
}

export type VerifiedGoogleUser = {
  email: string;
  name: string;
  emailVerified: boolean;
};

export type GoogleOAuthState = {
  area: "staff" | "buyer";
  next: string;
  remember: boolean;
  nonce: string;
};

function stateSigningKey(): string {
  // Prefer a dedicated secret; fall back to the OAuth client secret so one
  // credential pair is enough to stand the feature up.
  return (
    String(process.env.GOOGLE_OAUTH_STATE_SECRET || "").trim() ||
    googleOAuthClientSecret() ||
    "dev-only-google-oauth-state"
  );
}

export function signGoogleOAuthState(payload: Omit<GoogleOAuthState, "nonce">): string {
  const full: GoogleOAuthState = {
    ...payload,
    nonce: randomBytes(16).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", stateSigningKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGoogleOAuthState(raw: string): GoogleOAuthState {
  const [body, sig] = String(raw || "").split(".");
  if (!body || !sig) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", stateSigningKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleOAuthState;
  if (parsed.area !== "staff" && parsed.area !== "buyer") {
    throw new Error("Invalid OAuth state area.");
  }
  return {
    area: parsed.area,
    next: String(parsed.next || ""),
    remember: !!parsed.remember,
    nonce: String(parsed.nonce || ""),
  };
}

export function buildGoogleAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
  hostedDomain?: string;
}): string {
  const clientId = googleOAuthClientId();
  if (!clientId) throw new Error("Google sign-in is not configured (missing GOOGLE_OAUTH_CLIENT_ID).");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    access_type: "online",
    prompt: "select_account",
  });
  if (opts.hostedDomain) params.set("hd", opts.hostedDomain);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleAuthCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<VerifiedGoogleUser> {
  const clientId = googleOAuthClientId();
  const clientSecret = googleOAuthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Google sign-in is not configured.");
  }
  if (!opts.code || opts.code.length > 2048) {
    throw new Error("Invalid Google authorization code.");
  }

  const client = new OAuth2Client(clientId, clientSecret, opts.redirectUri);
  const { tokens } = await client.getToken(opts.code);
  if (!tokens.id_token) throw new Error("Google did not return an ID token.");

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Google account has no email.");
  if (payload?.email_verified !== true) {
    throw new Error("Google account email is not verified.");
  }

  return {
    email,
    name: String(payload?.name || "").trim(),
    emailVerified: true,
  };
}

/** @deprecated GIS One Tap path — prefer authorization-code redirect. */
export async function verifyGoogleIdToken(credential: string): Promise<VerifiedGoogleUser> {
  const clientId = googleOAuthClientId();
  if (!clientId) {
    throw new Error("Google sign-in is not configured (missing GOOGLE_OAUTH_CLIENT_ID).");
  }
  if (!credential || credential.length > 4096) {
    throw new Error("Invalid Google credential.");
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload();
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Google account has no email.");
  if (payload?.email_verified !== true) {
    throw new Error("Google account email is not verified.");
  }
  return {
    email,
    name: String(payload?.name || "").trim(),
    emailVerified: true,
  };
}
