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

/** Placeholder start time — tomorrow, rounded up to the next hour. Staff adjusts in Calendar. */
function defaultCallStart(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

/** Builds a Google Calendar "quick add event" URL — buyer optionally added as a guest. */
export function buildGoogleCalendarUrl(opts: {
  title: string;
  details: string;
  guestEmail?: string;
}): string {
  const start = defaultCallStart();
  const end = new Date(start.getTime() + DEFAULT_CALL_DURATION_MINUTES * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    details: opts.details,
    dates: `${toGoogleDateStamp(start)}/${toGoogleDateStamp(end)}`,
  });
  if (opts.guestEmail) params.set("add", opts.guestEmail);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
