/**
 * Plain-text draft for staff → buyer messages from the client detail page.
 * Shared by the preview modal and the mailto fallback when SendGrid isn't configured.
 */

export function buyerMessageDraft(opts: {
  buyerName: string;
  staffName: string;
  staffEmail: string;
}): { subject: string; body: string } {
  const name = (opts.buyerName || "").trim() || "there";
  const staffName = (opts.staffName || "").trim() || "Luxe Supply";
  const staffEmail = (opts.staffEmail || "").trim();
  const subject = "From Luxe Supply Co. — regarding your wholesale account";
  const body = [
    `Dear ${name},`,
    "",
    "",
    "",
    "Best regards,",
    staffName,
    ...(staffEmail ? [staffEmail] : []),
    "Luxe Supply Co.",
  ].join("\n");
  return { subject, body };
}
