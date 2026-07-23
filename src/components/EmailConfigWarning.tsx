import { isEmailConfigured } from "@/lib/email";

/**
 * Server component: loud warning wherever staff would otherwise assume buyer
 * emails are going out. Every lifecycle email (invoice ready, back-in-stock,
 * invites, overdue reminders) silently no-ops until RESEND_API_KEY is set.
 */
export function EmailConfigWarning() {
  if (isEmailConfigured()) return null;
  return (
    <div className="mb-5 rounded-card border border-danger/40 bg-danger/5 px-4 py-3 text-[12.5px] text-danger">
      <span className="font-semibold">Email is not configured on this deployment.</span>{" "}
      Buyer and staff emails (invoice ready, back-in-stock, invites, reminders) are
      silently skipped until <span className="font-mono">RESEND_API_KEY</span> is set —
      nothing you &quot;send&quot; from here reaches anyone.
    </div>
  );
}
