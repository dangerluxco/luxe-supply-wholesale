// Minimal Resend REST client (no SDK dependency). Requires env var RESEND_API_KEY;
// optional RESEND_FROM_EMAIL (default: Luxe Supply Co. <orders@wholesale.luxesupply.co>,
// the Resend-verified sending subdomain). If unset, sendEmail() is a no-op that
// returns false — callers must not block on it, so the app works before Resend
// is configured and every email flow lights up the moment the key is set.

export function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Brand every outgoing email with the company wordmark — the same gold-on-ink
 * treatment as the portal header and the invoice. Injected centrally here so
 * all ~dozen email types pick it up; bodies are simple <html><body> documents,
 * so the banner slots in right after the body tag. Idempotent: bodies that
 * already reference the logo are left alone.
 */
function withEmailBranding(html: string): string {
  if (html.includes("luxe-supply-logo")) return html;
  const origin = (process.env.BUYER_ORIGIN || "https://portal.luxesupply.co").replace(/\/$/, "");
  const banner = `<div style="margin:0 0 18px;padding:14px 18px;background:#16161A;border-radius:10px;"><img src="${origin}/luxe-supply-logo.png" alt="Luxe Supply Co." height="24" style="display:block;height:24px;width:auto;border:0;" /></div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${banner}`);
  }
  return banner + html;
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = [...new Set(opts.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!apiKey || !to.length) return false;

  const from =
    opts.from ||
    process.env.RESEND_FROM_EMAIL ||
    "Luxe Supply Co. <orders@wholesale.luxesupply.co>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: opts.subject,
        html: withEmailBranding(opts.html),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[email] Resend send failed:", res.status, text.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend send error:", err instanceof Error ? err.message : err);
    return false;
  }
}
