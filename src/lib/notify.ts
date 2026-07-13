// Staff notification email for new invoice requests. Non-blocking by design —
// callers should try/catch and never fail the submit if this throws or returns false.
import { sendEmail, escapeHtml } from "@/lib/email";
import { listActiveStaffEmails } from "@/lib/firestore/staff";
import { getNotifyEmails } from "@/lib/firestore/settings";
import { money } from "@/lib/format";

const STOREFRONT_ORIGIN = "https://photography-964f5.web.app";

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
  <p>A buyer submitted a new <strong>invoice request</strong> on the LuxeSupply wholesale portal.</p>
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
  <p><strong>${opts.itemCount}</strong> item${opts.itemCount === 1 ? "" : "s"} · order total ${escapeHtml(
    money(Math.round(opts.cartTotal)),
  )}</p>
  <p><a href="${STOREFRONT_ORIGIN}/wholesaleportal/rep/quotes/${opts.quoteId}">Open this invoice request</a> in the staff portal.</p>
  <p style="color:#666;font-size:13px;">Request ID: ${escapeHtml(opts.quoteId)}</p>
</body></html>`;

  const sent = await sendEmail({
    to: recipients,
    subject: `Invoice request from ${opts.customerName || "a buyer"} — LuxeSupply wholesale`,
    html,
    replyTo: opts.customerEmail || undefined,
  });
  return { sent, recipients };
}
