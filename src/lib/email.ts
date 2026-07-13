// Minimal SendGrid REST client (no SDK dependency) — same provider as the legacy
// Cloud Functions (functions/salesPortal.js uses @sendgrid/mail with SENDGRID_API_KEY).
// Requires env var SENDGRID_API_KEY; optional SENDGRID_FROM_EMAIL (default info@itemiq.ai).
// If unset, sendEmail() is a no-op that returns false — callers must not block on it.

export function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isEmailConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY;
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
}): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const to = [...new Set(opts.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!apiKey || !to.length) return false;

  const from = opts.from || process.env.SENDGRID_FROM_EMAIL || "info@itemiq.ai";

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: from },
        ...(opts.replyTo ? { reply_to: { email: opts.replyTo } } : {}),
        subject: opts.subject,
        content: [{ type: "text/html", value: opts.html }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[email] SendGrid send failed:", res.status, text.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] SendGrid send error:", err instanceof Error ? err.message : err);
    return false;
  }
}
