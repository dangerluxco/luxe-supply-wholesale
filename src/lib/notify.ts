// Staff notification email for new order requests. Non-blocking by design —
// callers should try/catch and never fail the submit if this throws or returns false.
import { sendEmail, escapeHtml, isEmailConfigured } from "@/lib/email";
import { listActiveStaffEmails } from "@/lib/firestore/staff";
import { getNotifyEmails } from "@/lib/firestore/settings";
import { money } from "@/lib/format";

/** localhost/127.* never has a real TLS cert in dev — use http:// for those hosts. */
function schemeFor(host: string): "http" | "https" {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https";
}

const BUYER_ORIGIN =
  process.env.BUYER_ORIGIN ||
  process.env.PUBLIC_ORIGIN ||
  (process.env.PUBLIC_HOST
    ? `${schemeFor(process.env.PUBLIC_HOST)}://${process.env.PUBLIC_HOST}`
    : "https://wholesale.luxesupply.co");

const STAFF_ORIGIN =
  process.env.STAFF_ORIGIN ||
  (process.env.PUBLIC_HOST
    ? `${schemeFor(process.env.PUBLIC_HOST)}://${process.env.PUBLIC_HOST}`
    : "https://wholesaleportal.luxesupply.co");

/** @deprecated Prefer BUYER_ORIGIN / STAFF_ORIGIN — kept for any leftover call sites. */
const STOREFRONT_ORIGIN = BUYER_ORIGIN;

export function buyerStorefrontOrigin(): string {
  return BUYER_ORIGIN.replace(/\/$/, "");
}

export function staffPortalOrigin(): string {
  return STAFF_ORIGIN.replace(/\/$/, "");
}

export async function notifyStaffOfInvoiceRequest(opts: {
  quoteId: string;
  customerName: string;
  customerEmail: string;
  customerCompany?: string;
  customerPhone?: string;
  message?: string;
  items: Array<{ sku: string; title: string; brand?: string; price?: number | null }>;
  itemCount: number;
  cartTotal: number;
  shippingLabel?: string;
  shipping?: number;
}): Promise<{ sent: boolean; recipients: string[] }> {
  const [staffEmails, extraEmails] = await Promise.all([
    listActiveStaffEmails(),
    getNotifyEmails(),
  ]);
  // Fallback to an env var so this works even before any staff/settings emails exist.
  const envEmails = String(process.env.STAFF_NOTIFICATION_EMAILS || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const recipients = [...new Set([...staffEmails, ...extraEmails, ...envEmails])];
  if (!recipients.length) {
    console.warn("[notify] No staff recipients configured for invoice request", opts.quoteId);
    return { sent: false, recipients: [] };
  }

  const rows = opts.items
    .map(
      (it) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.sku)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.title)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.brand || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${
          it.price != null ? escapeHtml(money(Math.round(it.price))) : "—"
        }</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>A buyer submitted a new <strong>order request</strong> on the LuxeSupply wholesale portal.</p>
  <p>
    <strong>From:</strong> ${escapeHtml(opts.customerName)} &lt;${escapeHtml(opts.customerEmail)}&gt;<br/>
    ${opts.customerCompany ? `<strong>Company:</strong> ${escapeHtml(opts.customerCompany)}<br/>` : ""}
    ${opts.customerPhone ? `<strong>Phone:</strong> ${escapeHtml(opts.customerPhone)}<br/>` : ""}
  </p>
  ${
    opts.message
      ? `<p><strong>Message:</strong><br/>${escapeHtml(opts.message).replace(/\n/g, "<br/>")}</p>`
      : ""
  }
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <thead>
      <tr style="background:#f5f7fa;text-align:left;">
        <th style="padding:8px;">SKU</th>
        <th style="padding:8px;">Item</th>
        <th style="padding:8px;">Brand</th>
        <th style="padding:8px;text-align:right;">Price</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p><strong>${opts.itemCount}</strong> item${opts.itemCount === 1 ? "" : "s"} · merchandise ${escapeHtml(
    money(Math.round(opts.cartTotal)),
  )}${
    opts.shippingLabel
      ? ` · shipping ${escapeHtml(opts.shippingLabel)} (${escapeHtml(
          money(Math.round(opts.shipping || 0)),
        )}) · order total ${escapeHtml(
          money(Math.round(opts.cartTotal + (opts.shipping || 0))),
        )}`
      : ""
  }</p>
  <p><a href="${STAFF_ORIGIN}/wholesaleportal/rep/quotes/${opts.quoteId}">Open this order request</a> in the staff portal.</p>
  <p style="color:#666;font-size:13px;">Request ID: ${escapeHtml(opts.quoteId)}</p>
</body></html>`;

  const sent = await sendEmail({
    to: recipients,
    subject: `Order request from ${opts.customerName || "a buyer"} — LuxeSupply wholesale`,
    html,
    replyTo: opts.customerEmail || undefined,
  });
  return { sent, recipients };
}

export async function notifyStaffOfRegistrationRequest(opts: {
  applicationId: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
}): Promise<{ sent: boolean; recipients: string[] }> {
  const [staffEmails, extraEmails] = await Promise.all([
    listActiveStaffEmails(),
    getNotifyEmails(),
  ]);
  const envEmails = String(process.env.STAFF_NOTIFICATION_EMAILS || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const recipients = [...new Set([...staffEmails, ...extraEmails, ...envEmails])];
  if (!recipients.length) {
    console.warn("[notify] No staff recipients for registration", opts.applicationId);
    return { sent: false, recipients: [] };
  }

  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>A new <strong>buyer registration request</strong> was submitted on the LuxeSupply wholesale portal.</p>
  <p>
    <strong>Name:</strong> ${escapeHtml(opts.name)}<br/>
    <strong>Email:</strong> ${escapeHtml(opts.email)}<br/>
    ${opts.company ? `<strong>Company:</strong> ${escapeHtml(opts.company)}<br/>` : ""}
    ${opts.phone ? `<strong>Phone:</strong> ${escapeHtml(opts.phone)}<br/>` : ""}
  </p>
  <p><a href="${STAFF_ORIGIN}/wholesaleportal/rep/applications/${opts.applicationId}">Review application</a> in the staff portal — you can approve (creates a buyer login) or reject.</p>
</body></html>`;

  const sent = await sendEmail({
    to: recipients,
    subject: `Buyer registration request — ${opts.name || opts.email}`,
    html,
    replyTo: opts.email || undefined,
  });
  return { sent, recipients };
}

/** Invite email for a new buyer storefront login. Non-blocking. */
export async function sendBuyerInviteEmail(opts: {
  email: string;
  username: string;
  temporaryPassword: string;
}): Promise<boolean> {
  const loginUrl = `${buyerStorefrontOrigin()}/wholesale/sign-in`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>You’ve been invited to the <strong>LuxeSupply wholesale storefront</strong>.</p>
  <p>
    <strong>Sign in:</strong> <a href="${loginUrl}">${escapeHtml(loginUrl)}</a><br/>
    <strong>Username:</strong> ${escapeHtml(opts.username)}<br/>
    <strong>Temporary password:</strong> ${escapeHtml(opts.temporaryPassword)}
  </p>
  <p>Sign in with this temporary password, then change it from your account settings if you’d like.</p>
  <p style="color:#666;font-size:13px;">If you did not expect this invitation, you can ignore this email.</p>
</body></html>`;

  return sendEmail({
    to: [opts.email],
    subject: "Your LuxeSupply wholesale login",
    html,
  });
}

/** Staff-triggered buyer password reset (emails a temporary password). Non-blocking. */
export async function sendBuyerPasswordResetEmail(opts: {
  email: string;
  username: string;
  temporaryPassword: string;
}): Promise<boolean> {
  const loginUrl = `${buyerStorefrontOrigin()}/wholesale/sign-in`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>Your LuxeSupply wholesale storefront password was reset.</p>
  <p>
    <strong>Sign in:</strong> <a href="${loginUrl}">${escapeHtml(loginUrl)}</a><br/>
    <strong>Username:</strong> ${escapeHtml(opts.username)}<br/>
    <strong>Temporary password:</strong> ${escapeHtml(opts.temporaryPassword)}
  </p>
  <p>Sign in with this temporary password to continue shopping.</p>
</body></html>`;

  return sendEmail({
    to: [opts.email],
    subject: "Your LuxeSupply wholesale password was reset",
    html,
  });
}

/** Invite email for a new staff login. Non-blocking — callers should not fail if this returns false. */
export async function sendStaffInviteEmail(opts: {
  email: string;
  temporaryPassword: string;
}): Promise<boolean> {
  const loginUrl = `${STAFF_ORIGIN}/wholesaleportal/sign-in`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>You’ve been invited to the <strong>LuxeSupply wholesale portal</strong> staff console.</p>
  <p>
    <strong>Staff login:</strong> <a href="${loginUrl}">${escapeHtml(loginUrl)}</a><br/>
    <strong>Email:</strong> ${escapeHtml(opts.email)}<br/>
    <strong>Temporary password:</strong> ${escapeHtml(opts.temporaryPassword)}
  </p>
  <p>Sign in with this temporary password to manage quotes, clients, and catalog settings.</p>
  <p style="color:#666;font-size:13px;">If you did not expect this invitation, you can ignore this email.</p>
</body></html>`;

  return sendEmail({
    to: [opts.email],
    subject: "Your LuxeSupply wholesale portal staff login",
    html,
  });
}

/** Password-reset email for an existing staff login. Non-blocking. */
export async function sendStaffPasswordResetEmail(opts: {
  email: string;
  temporaryPassword: string;
}): Promise<boolean> {
  const loginUrl = `${STAFF_ORIGIN}/wholesaleportal/sign-in`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>Your wholesale portal staff password was reset.</p>
  <p>
    <strong>Staff login:</strong> <a href="${loginUrl}">${escapeHtml(loginUrl)}</a><br/>
    <strong>Email:</strong> ${escapeHtml(opts.email)}<br/>
    <strong>Temporary password:</strong> ${escapeHtml(opts.temporaryPassword)}
  </p>
  <p>Sign in with this temporary password to continue managing the wholesale portal.</p>
</body></html>`;

  return sendEmail({
    to: [opts.email],
    subject: "Your wholesale portal staff password was reset",
    html,
  });
}

/**
 * Self-service "forgot password" link email — shared by the buyer storefront and staff
 * console. Sends a one-time reset link, not a temporary password (see sendStaffPasswordResetEmail
 * for the admin-triggered temp-password flow).
 */
export async function sendPasswordResetLinkEmail(opts: {
  email: string;
  resetUrl: string;
  isStaff: boolean;
}): Promise<boolean> {
  if (!isEmailConfigured()) {
    // No SendGrid key locally — log the link so the flow is still testable in dev.
    console.log(`[password-reset] SENDGRID_API_KEY not set. Reset link for ${opts.email}: ${opts.resetUrl}`);
  }
  const portalLabel = opts.isStaff ? "wholesale portal staff console" : "wholesale storefront";
  const html = `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.55;color:#333;max-width:640px;">
  <p>We received a request to reset the password for your LuxeSupply ${portalLabel} account.</p>
  <p><a href="${opts.resetUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">Reset your password</a></p>
  <p style="color:#666;font-size:13px;">This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password will not change.</p>
  <p style="color:#666;font-size:12px;">If the button doesn't work, copy and paste this link: ${escapeHtml(opts.resetUrl)}</p>
</body></html>`;

  return sendEmail({
    to: [opts.email],
    subject: "Reset your LuxeSupply password",
    html,
  });
}
