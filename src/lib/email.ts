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
        html: opts.html,
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
