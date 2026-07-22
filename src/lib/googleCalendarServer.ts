import "server-only";
import { OAuth2Client } from "google-auth-library";
import { googleOAuthClientId, googleOAuthClientSecret } from "@/lib/googleOAuth";
import { defaultCallDurationMinutes } from "@/lib/googleCalendar";

/**
 * Server-only Google Calendar API create — kept out of googleCalendar.ts so the
 * client-safe URL helpers there don't drag google-auth-library (Node built-ins)
 * into the browser bundle.
 *
 * Creates a real event on the staffer's primary calendar using their stored
 * refresh token. `sendUpdates=all` emails invites to every attendee (buyer +
 * rep). Throws "CALENDAR_AUTH: …" on revoked access so the caller can trigger
 * the reconnect flow.
 */
export async function createCalendarEvent(opts: {
  refreshToken: string;
  title: string;
  description: string;
  start: Date;
  durationMinutes?: number;
  attendeeEmails: string[];
}): Promise<{ id: string; htmlLink: string }> {
  const client = new OAuth2Client(googleOAuthClientId(), googleOAuthClientSecret());
  client.setCredentials({ refresh_token: opts.refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Could not refresh Google Calendar access.");

  const start = opts.start;
  const end = new Date(
    start.getTime() + Math.max(5, opts.durationMinutes ?? defaultCallDurationMinutes()) * 60_000,
  );
  const attendees = [
    ...new Set(opts.attendeeEmails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)),
  ].map((email) => ({ email }));

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: opts.title,
        description: opts.description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees,
        reminders: { useDefault: true },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("CALENDAR_AUTH: calendar access was revoked — reconnect Google Calendar.");
    }
    throw new Error(`Calendar API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string; htmlLink?: string };
  return { id: String(data.id || ""), htmlLink: String(data.htmlLink || "") };
}
