import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getStaffById, setStaffCalendarToken } from "@/lib/firestore/staff";
import { createCalendarEvent } from "@/lib/googleCalendarServer";
import { decryptTotpSecret } from "@/lib/totp";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

/**
 * Create a real Google Calendar event as the signed-in staffer. Responds
 * `needsConnect: true` when no calendar is connected (or access was revoked)
 * so the UI can offer the connect flow / template fallback.
 */
export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const staff = await getStaffById(session.id);
  if (!staff) {
    return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
  }
  if (!staff.calendarRefreshTokenEnc) {
    return NextResponse.json({ needsConnect: true }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    details?: string;
    startIso?: string;
    durationMinutes?: number;
    guestEmails?: string[];
  };
  const title = String(body.title || "").trim();
  const start = body.startIso ? new Date(body.startIso) : null;
  if (!title || !start || Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "Title and a valid start time are required." }, { status: 400 });
  }

  try {
    const refreshToken = decryptTotpSecret(staff.calendarRefreshTokenEnc);
    const event = await createCalendarEvent({
      refreshToken,
      title,
      description: String(body.details || ""),
      start,
      durationMinutes: Number(body.durationMinutes) || undefined,
      attendeeEmails: [session.email, ...(Array.isArray(body.guestEmails) ? body.guestEmails : [])],
    });
    await logAudit({
      actor: session,
      action: "calendar.event_created",
      entity: "calendarEvent",
      entityId: event.id,
      payload: { title },
    });
    return NextResponse.json({ ok: true, htmlLink: event.htmlLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create the event.";
    if (message.startsWith("CALENDAR_AUTH:")) {
      // Token revoked — clear it so the UI cleanly re-offers connect.
      await setStaffCalendarToken(session.id, null).catch(() => {});
      return NextResponse.json({ needsConnect: true }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
