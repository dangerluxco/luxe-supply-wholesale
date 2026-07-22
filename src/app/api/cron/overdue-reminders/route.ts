import { NextRequest, NextResponse } from "next/server";
import { listInvoices, markReminderSent } from "@/lib/firestore/invoices";
import { sendOverdueReminderEmail } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/email";

/** Re-remind at most once per invoice per this many days. */
const REMINDER_INTERVAL_DAYS = 7;

/**
 * Daily overdue-invoice reminders. For each unpaid invoice past its due date,
 * email the buyer a reminder — throttled to once per REMINDER_INTERVAL_DAYS via
 * lastReminderAt on the invoice. No-op (reported, not errored) until Resend is
 * configured.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (same contract as expire-bundles).
 * Cloud Scheduler job: luxe-overdue-reminders → this route
 */
export async function POST(request: NextRequest) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const querySecret = request.nextUrl.searchParams.get("secret") || "";
  if (bearer !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true, skipped: "email not configured (RESEND_API_KEY)" });
  }

  const now = Date.now();
  const invoices = await listInvoices({ limit: 1000 });
  const due = invoices.filter((inv) => {
    if (inv.status === "PAID" || inv.balance <= 0) return false;
    if (!inv.dueDate || !inv.customerEmail) return false;
    if (new Date(inv.dueDate).getTime() >= now) return false;
    if (
      inv.lastReminderAt &&
      now - new Date(inv.lastReminderAt).getTime() < REMINDER_INTERVAL_DAYS * 86_400_000
    ) {
      return false;
    }
    return true;
  });

  const sent: string[] = [];
  const failed: string[] = [];
  for (const inv of due) {
    const daysOverdue = Math.floor((now - new Date(inv.dueDate!).getTime()) / 86_400_000);
    const ok = await sendOverdueReminderEmail({
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      total: inv.total,
      balance: inv.balance,
      dueDate: inv.dueDate,
      daysOverdue,
    }).catch(() => false);
    if (ok) {
      await markReminderSent(inv.id).catch(() => {});
      sent.push(inv.invoiceNumber);
    } else {
      failed.push(inv.invoiceNumber);
    }
  }

  return NextResponse.json({
    ok: true,
    intervalDays: REMINDER_INTERVAL_DAYS,
    eligible: due.length,
    sent,
    failed,
  });
}

/** GET alias so the job can be a plain URL fetch (mirrors expire-bundles). */
export async function GET(request: NextRequest) {
  return POST(request);
}
