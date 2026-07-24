/**
 * Plain-text drafts for "Request a call" emails — shared by preview modals and
 * the mailto fallback when SendGrid isn't configured.
 */

export function curationCallRequestDraft(opts: {
  customerName: string;
  curationUrl: string;
  itemCount: number;
  estimatedTotal: number | null;
  staffName: string;
}): { subject: string; body: string } {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const subject = "Your curate view is ready — let's schedule a call · Luxe Supply Co.";
  const selectionBits =
    opts.itemCount > 0
      ? ` — ${opts.itemCount} piece${opts.itemCount === 1 ? "" : "s"}${
          opts.estimatedTotal != null
            ? ` · $${Math.round(opts.estimatedTotal).toLocaleString("en-US")}`
            : ""
        }`
      : "";
  const body = [
    `Hi ${firstName},`,
    "",
    `We've put together a curate view just for you${selectionBits}. Take a look, mark what you like, and we'll walk through the pieces together on a quick call.`,
    "",
    "Just reply with a few times that work for you and we'll send over a calendar invite.",
    "",
    `Open your curate view: ${opts.curationUrl}`,
    "",
    opts.staffName,
    "Luxe Supply Co.",
  ].join("\n");
  return { subject, body };
}

export function quoteCallRequestDraft(opts: {
  customerName: string;
  orderUrl: string;
  orderTotal: number | null;
  staffName: string;
}): { subject: string; body: string } {
  const firstName = (opts.customerName || "").trim().split(/\s+/)[0] || "there";
  const subject = "Let's schedule a call about your order — Luxe Supply Co.";
  const body = [
    `Hi ${firstName},`,
    "",
    `Thanks for your order request${
      opts.orderTotal != null ? ` ($${opts.orderTotal.toLocaleString("en-US")})` : ""
    }. We'd love to hop on a quick call to walk through the pieces together and finalize your order.`,
    "",
    "Just reply with a few times that work for you and we'll send over a calendar invite.",
    "",
    `View your order request: ${opts.orderUrl}`,
    "",
    opts.staffName,
    "Luxe Supply Co.",
  ].join("\n");
  return { subject, body };
}

/** Turn staff-edited plain text into simple HTML paragraphs for SendGrid. */
export function plainTextToEmailHtml(text: string): string {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Roboto,Helvetica,sans-serif;line-height:1.6;color:#333;max-width:640px;">
  <p style="font-size:15px;font-weight:600;letter-spacing:0.06em;">LUXE SUPPLY<span style="color:#B08D3E;">*</span></p>
  ${paragraphs}
</body></html>`;
}
