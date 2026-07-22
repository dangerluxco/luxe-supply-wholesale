// NOTE: keep this module client-safe (it's imported by BookCallEventModal).
// The server-only Calendar API create lives in googleCalendarServer.ts.
const DEFAULT_CALL_DURATION_MINUTES = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Google Calendar's TEMPLATE `dates` param wants basic ISO (no dashes/colons/millis). */
function toGoogleDateStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Placeholder start time — tomorrow, rounded up to the next hour. Staff adjusts in the modal. */
export function defaultCallStart(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function defaultCallDurationMinutes(): number {
  return DEFAULT_CALL_DURATION_MINUTES;
}

/** Local `datetime-local` value (no timezone) for an HTML input. */
export function toDatetimeLocalValue(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/**
 * Builds a Google Calendar "quick add event" URL — guests via `add=`.
 * Fallback path for staff who haven't connected their calendar (the live
 * path is createCalendarEvent via /api/staff/calendar/create-event).
 */
export function buildGoogleCalendarUrl(opts: {
  title: string;
  details: string;
  guestEmail?: string;
  guestEmails?: string[];
  start?: Date;
  durationMinutes?: number;
}): string {
  const start = opts.start && !Number.isNaN(opts.start.getTime()) ? opts.start : defaultCallStart();
  const duration = opts.durationMinutes ?? DEFAULT_CALL_DURATION_MINUTES;
  const end = new Date(start.getTime() + Math.max(5, duration) * 60 * 1000);
  const guests = [
    ...new Set(
      [...(opts.guestEmails || []), opts.guestEmail || ""]
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    details: opts.details,
    dates: `${toGoogleDateStamp(start)}/${toGoogleDateStamp(end)}`,
  });
  if (guests.length) params.set("add", guests.join(","));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
