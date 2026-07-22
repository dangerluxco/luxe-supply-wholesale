// Staff notification email for new order requests. Non-blocking by design —
// callers should try/catch and never fail the submit if this throws or returns false.
import { sendEmail, escapeHtml, isEmailConfigured } from "@/lib/email";
import { listActiveStaffEmails } from "@/lib/firestore/staff";
import { getNotifyEmails } from "@/lib/firestore/settings";
import { money } from "@/lib/format";
import { plainTextToEmailHtml } from "@/lib/callRequestDraft";

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

/**
 * Free-form staff → buyer email from the client detail page.
 * Reply-to is the staff user so buyer replies go to them; From stays SendGrid default.
 */
export async function sendBuyerMessageEmail(opts: {
  buyerEmail: string;
  staffEmail: string;
  subject: string;
  bodyText: string;
}): Promise<boolean> {
  const subject = (opts.subject || "").trim();
  const bodyText = (opts.bodyText || "").trim();
  if (!opts.buyerEmail || !subject || !bodyText) return false;

  return sendEmail({
    to: [opts.buyerEmail],
    subject,
    html: plainTextToEmailHtml(bodyText),
    replyTo: opts.staffEmail || undefined,
  });
}

/**
 * Buyer-facing "we'd like to schedule a call" email — the precursor to Book
 * Call. Reply-to is the requesting rep, so the buyer's proposed times land
 * straight in their inbox and the rep books from there.
 */
export async function sendCallRequestEmail(opts: {
  quoteId: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  orderTotal: number | null;
  staffName: string;
  staffEmail: string;
  /** Staff-edited overrides from the draft preview modal. */
  subject?: string;
  bodyText?: string;
}): Promise<boolean> {
  const orderUrl = `${buyerStorefrontOrigin()}/wholesale/orders/${opts.quoteId}`;
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const subject =
    (opts.subject || "").trim() || "Let's schedule a call about your order — Luxe Supply Co.";
  const html = opts.bodyText?.trim()
    ? plainTextToEmailHtml(opts.bodyText)
    : `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.6;color:#333;max-width:640px;">
  <p style="font-size:15px;font-weight:600;letter-spacing:0.06em;">LUXE SUPPLY<span style="color:#B08D3E;">*</span></p>
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>Thanks for your order request${
    opts.itemCount
      ? ` (<strong>${opts.itemCount} item${opts.itemCount === 1 ? "" : "s"}</strong>${
          opts.orderTotal != null ? ` · ${escapeHtml(money(Math.round(opts.orderTotal)))}` : ""
        })`
      : ""
  }. We'd love to hop on a quick call to walk through the pieces together, answer questions, and finalize your order.</p>
  <p><strong>Just reply to this email with a few times that work for you</strong> and we'll send over a calendar invite.</p>
  <p><a href="${orderUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View your order request</a></p>
  <p>Talk soon,<br/>${escapeHtml(opts.staffName)}<br/><span style="color:#666;">Luxe Supply Co. · ${escapeHtml(opts.staffEmail)}</span></p>
  <p style="color:#666;font-size:12px;">Request ID: ${escapeHtml(opts.quoteId)}</p>
</body></html>`;

  return sendEmail({
    to: [opts.customerEmail],
    subject,
    html,
    replyTo: opts.staffEmail || undefined,
  });
}

/**
 * Buyer-facing call request for an ad-hoc curation share (no order request yet).
 * Includes the buyer curation URL; reply-to is the rep so proposed times land in
 * their inbox, then they Book call from the curation manager.
 */
export async function sendCurationCallRequestEmail(opts: {
  token: string;
  curationUrl: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  estimatedTotal: number | null;
  clientLabel?: string;
  staffName: string;
  staffEmail: string;
  /** Staff-edited overrides from the draft preview modal. */
  subject?: string;
  bodyText?: string;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const selection =
    opts.clientLabel && opts.clientLabel.trim()
      ? escapeHtml(opts.clientLabel.trim())
      : "a curated selection";
  const subject =
    (opts.subject || "").trim() ||
    "Let's schedule a call about your curated selection — Luxe Supply Co.";
  const html = opts.bodyText?.trim()
    ? plainTextToEmailHtml(opts.bodyText)
    : `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.6;color:#333;max-width:640px;">
  <p style="font-size:15px;font-weight:600;letter-spacing:0.06em;">LUXE SUPPLY<span style="color:#B08D3E;">*</span></p>
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>We've put together ${selection}${
    opts.itemCount
      ? ` (<strong>${opts.itemCount} item${opts.itemCount === 1 ? "" : "s"}</strong>${
          opts.estimatedTotal != null
            ? ` · ${escapeHtml(money(Math.round(opts.estimatedTotal)))}`
            : ""
        })`
      : ""
  } and would love to hop on a quick call to walk through the pieces together.</p>
  <p><strong>Just reply to this email with a few times that work for you</strong> and we'll send over a calendar invite.</p>
  <p><a href="${opts.curationUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View your curated selection</a></p>
  <p>Talk soon,<br/>${escapeHtml(opts.staffName)}<br/><span style="color:#666;">Luxe Supply Co. · ${escapeHtml(opts.staffEmail)}</span></p>
  <p style="color:#666;font-size:12px;">Curation link: ${escapeHtml(opts.token)}</p>
</body></html>`;

  return sendEmail({
    to: [opts.customerEmail],
    subject,
    html,
    replyTo: opts.staffEmail || undefined,
  });
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
    console.log(`[password-reset] RESEND_API_KEY not set. Reset link for ${opts.email}: ${opts.resetUrl}`);
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

/* ------------------------------------------------------------------ */
/* Buyer lifecycle emails — all non-blocking; no-ops until Resend key. */
/* ------------------------------------------------------------------ */

const BRAND_HEADER = `<p style="font-size:15px;font-weight:600;letter-spacing:0.06em;">LUXE SUPPLY<span style="color:#B08D3E;">*</span></p>`;

function emailShell(inner: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.6;color:#333;max-width:640px;">
  ${BRAND_HEADER}
  ${inner}
</body></html>`;
}

/** Buyer confirmation right after they submit an order request. */
export async function sendOrderRequestConfirmationEmail(opts: {
  quoteId: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  orderTotal: number;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const orderUrl = `${buyerStorefrontOrigin()}/wholesale/orders/${opts.quoteId}`;
  const html = emailShell(`
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>We received your <strong>order request</strong> — <strong>${opts.itemCount} item${
    opts.itemCount === 1 ? "" : "s"
  }</strong> · ${escapeHtml(money(Math.round(opts.orderTotal)))}. Our team will review it and follow up shortly, usually within one business day.</p>
  <p><a href="${orderUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View your order request</a></p>
  <p style="color:#666;font-size:13px;">Each piece is one-of-one, so items in your request are soft-held while we review. Request ID: ${escapeHtml(opts.quoteId)}</p>`);
  return sendEmail({
    to: [opts.customerEmail],
    subject: "We received your order request — Luxe Supply Co.",
    html,
  });
}

/** Buyer notification when a formal invoice is generated from their request. */
export async function sendInvoiceReadyEmail(opts: {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  dueDate: string | null;
  terms: string;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const invoiceUrl = `${buyerStorefrontOrigin()}/wholesale/invoices/${encodeURIComponent(opts.invoiceNumber)}`;
  const due = opts.dueDate
    ? new Date(opts.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const html = emailShell(`
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>Your invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong> is ready — total ${escapeHtml(
    money(Math.round(opts.total)),
  )}${due ? `, due <strong>${escapeHtml(due)}</strong>` : ""} (${escapeHtml(opts.terms)}).</p>
  <p><a href="${invoiceUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View invoice</a></p>
  <p style="color:#666;font-size:13px;">Wire instructions are on the downloadable PDF invoice. Reply to this email with any questions.</p>`);
  return sendEmail({
    to: [opts.customerEmail],
    subject: `Invoice ${opts.invoiceNumber} — Luxe Supply Co.`,
    html,
  });
}

/** Buyer receipt when staff mark their invoice paid. */
export async function sendPaymentReceiptEmail(opts: {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const invoiceUrl = `${buyerStorefrontOrigin()}/wholesale/invoices/${encodeURIComponent(opts.invoiceNumber)}`;
  const html = emailShell(`
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>We've received your payment for invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong> (${escapeHtml(
    money(Math.round(opts.total)),
  )}). Thank you!</p>
  <p>We'll follow up with shipping details as soon as your pieces are on their way.</p>
  <p><a href="${invoiceUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View invoice</a></p>`);
  return sendEmail({
    to: [opts.customerEmail],
    subject: `Payment received — invoice ${opts.invoiceNumber}`,
    html,
  });
}

/** Buyer notification when their order ships, with a tracking link when known. */
export async function sendShippedEmail(opts: {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const invoiceUrl = `${buyerStorefrontOrigin()}/wholesale/invoices/${encodeURIComponent(opts.invoiceNumber)}`;
  const trackingBit = opts.trackingNumber
    ? opts.trackingUrl
      ? `<p><strong>Tracking:</strong> <a href="${opts.trackingUrl}">${escapeHtml(opts.trackingNumber)}</a> (${escapeHtml(opts.carrier)})</p>`
      : `<p><strong>Tracking:</strong> ${escapeHtml(opts.trackingNumber)} (${escapeHtml(opts.carrier)})</p>`
    : `<p><strong>Carrier:</strong> ${escapeHtml(opts.carrier)}</p>`;
  const html = emailShell(`
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>Great news — your order (invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong>) has <strong>shipped</strong>.</p>
  ${trackingBit}
  <p><a href="${invoiceUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View invoice &amp; shipment</a></p>`);
  return sendEmail({
    to: [opts.customerEmail],
    subject: `Your order has shipped — invoice ${opts.invoiceNumber}`,
    html,
  });
}

/** Buyer alert when a piece they were waiting on becomes available again. */
export async function sendBackInStockEmail(opts: {
  customerName: string;
  customerEmail: string;
  sku: string;
  title: string;
  brand?: string;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const productUrl = `${buyerStorefrontOrigin()}/wholesale/product/${encodeURIComponent(opts.sku)}`;
  const html = emailShell(`
  <p>Hi ${escapeHtml(firstName)},</p>
  <p><strong>${escapeHtml(opts.title)}</strong>${
    opts.brand ? ` by ${escapeHtml(opts.brand)}` : ""
  } is <strong>available again</strong>. It's one-of-one — when it's gone, it's gone.</p>
  <p><a href="${productUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View the piece</a></p>
  <p style="color:#666;font-size:13px;">You asked us to let you know when this piece freed up. SKU: ${escapeHtml(opts.sku)}</p>`);
  return sendEmail({
    to: [opts.customerEmail],
    subject: `Available again: ${opts.title} — Luxe Supply Co.`,
    html,
  });
}

/** Overdue invoice reminder (sent by the daily cron). */
export async function sendOverdueReminderEmail(opts: {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  balance: number;
  dueDate: string | null;
  daysOverdue: number;
}): Promise<boolean> {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const invoiceUrl = `${buyerStorefrontOrigin()}/wholesale/invoices/${encodeURIComponent(opts.invoiceNumber)}`;
  const html = emailShell(`
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>A friendly reminder that invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong> is now <strong>${
    opts.daysOverdue
  } day${opts.daysOverdue === 1 ? "" : "s"} past due</strong> — outstanding balance ${escapeHtml(
    money(Math.round(opts.balance)),
  )}.</p>
  <p><a href="${invoiceUrl}" style="display:inline-block;padding:10px 20px;background:#16161a;color:#fff;text-decoration:none;border-radius:4px;">View invoice</a></p>
  <p style="color:#666;font-size:13px;">Wire instructions are on the PDF invoice. If payment is already on its way, please disregard — or reply and let us know.</p>`);
  return sendEmail({
    to: [opts.customerEmail],
    subject: `Reminder: invoice ${opts.invoiceNumber} is past due`,
    html,
  });
}

/** Staff notification when a buyer requests a call/viewing about a piece. */
export async function notifyStaffOfCallRequest(opts: {
  requestId: string;
  buyerName: string;
  buyerEmail: string;
  sku: string;
  title: string;
  /** Multi-piece (cart) requests: "Title (SKU)" lines. */
  items?: string[];
  preferredTimes?: string;
  note?: string;
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
    console.warn("[notify] No staff recipients for call request", opts.requestId);
    return { sent: false, recipients: [] };
  }

  const pieceLine =
    opts.items && opts.items.length > 1
      ? `<strong>Pieces (${opts.items.length}):</strong><br/>${opts.items
          .map((it) => `&nbsp;&nbsp;· ${escapeHtml(it)}`)
          .join("<br/>")}<br/>`
      : `<strong>Piece:</strong> ${escapeHtml(opts.title)} (${escapeHtml(opts.sku)})<br/>`;
  const html = emailShell(`
  <p>A buyer requested a <strong>call / viewing</strong> on the wholesale storefront.</p>
  <p>
    <strong>Buyer:</strong> ${escapeHtml(opts.buyerName)} &lt;${escapeHtml(opts.buyerEmail)}&gt;<br/>
    ${pieceLine}
    ${opts.preferredTimes ? `<strong>Preferred times:</strong> ${escapeHtml(opts.preferredTimes)}<br/>` : ""}
  </p>
  ${opts.note ? `<p><strong>Note:</strong><br/>${escapeHtml(opts.note).replace(/\n/g, "<br/>")}</p>` : ""}
  <p><a href="${staffPortalOrigin()}/wholesaleportal/rep/dashboard">Open the dashboard</a> to follow up — reply to this email to reach the buyer directly.</p>`);

  const sent = await sendEmail({
    to: recipients,
    subject: `Call request: ${opts.title} — ${opts.buyerName || "a buyer"}`,
    html,
    replyTo: opts.buyerEmail || undefined,
  });
  return { sent, recipients };
}
