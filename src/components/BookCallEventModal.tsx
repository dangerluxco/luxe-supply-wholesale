"use client";

import { PressableButton } from "@/components/PressableButton";
import {
  buildGoogleCalendarUrl,
  defaultCallDurationMinutes,
  toDatetimeLocalValue,
} from "@/lib/googleCalendar";

const fieldClass =
  "w-full rounded-chip border border-border bg-ground px-3 py-2 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge mb-1.5 block text-[10px] tracking-[0.14em] text-muted";

export type BookCallEventDraft = {
  title: string;
  details: string;
  /** Comma-separated guest emails (buyer + staff). */
  attendees: string;
  startLocal: string;
  durationMinutes: number;
  notes: string;
};

export function bookCallDraftFromApi(opts: {
  title: string;
  details: string;
  guestEmails: string[];
  startIso?: string;
  durationMinutes?: number;
}): BookCallEventDraft {
  const start = opts.startIso ? new Date(opts.startIso) : new Date();
  return {
    title: opts.title,
    details: opts.details,
    attendees: opts.guestEmails.filter(Boolean).join(", "),
    startLocal: toDatetimeLocalValue(Number.isNaN(start.getTime()) ? new Date() : start),
    durationMinutes: opts.durationMinutes ?? defaultCallDurationMinutes(),
    notes: "",
  };
}

/**
 * In-portal event editor: date/time, title, description, attendees, notes.
 * Primary path creates a REAL Calendar event via /api/staff/calendar/create-event
 * (invites emailed to all guests). Staff without a connected calendar get a
 * one-click connect flow, with the pre-filled template URL as a manual fallback.
 */
export function BookCallEventModal({
  draft,
  pending,
  error,
  onChange,
  onCancel,
  onConfirm,
}: {
  draft: BookCallEventDraft;
  pending?: boolean;
  error?: string | null;
  onChange: (next: BookCallEventDraft) => void;
  onCancel: () => void;
  onConfirm: (calendarUrl: string) => void;
}) {
  // Template-URL flow only (the "eelo way"): no Calendar API scopes are ever
  // requested, so staff never see Google's unverified-app screen. The Calendar
  // API plumbing (connect flow + create-event route) is kept server-side and
  // can be re-enabled here if the app gets verified later.
  function openTemplate() {
    const start = new Date(draft.startLocal);
    if (Number.isNaN(start.getTime())) return;
    const guestEmails = draft.attendees
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const notes = draft.notes.trim();
    const details = notes ? `${draft.details.trim()}\n\nNotes:\n${notes}` : draft.details.trim();
    onConfirm(
      buildGoogleCalendarUrl({
        title: draft.title.trim() || "Call",
        details,
        guestEmails,
        start,
        durationMinutes: draft.durationMinutes,
      }),
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6 pt-[8vh]"
      onClick={onCancel}
    >
      <div
        className="w-[560px] max-w-full overflow-hidden rounded-card border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[16px] font-semibold text-ink">Book call</h2>
          <button type="button" onClick={onCancel} className="text-[12px] text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-[12.5px] text-secondary">
            Set the event details here, then open Google Calendar with everything pre-filled —
            hit Save there and double-check the guest list before sending.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="book-call-start">
                DATE &amp; TIME
              </label>
              <input
                id="book-call-start"
                type="datetime-local"
                value={draft.startLocal}
                onChange={(e) => onChange({ ...draft, startLocal: e.target.value })}
                className={`h-10 ${fieldClass}`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="book-call-duration">
                DURATION (MIN)
              </label>
              <input
                id="book-call-duration"
                type="number"
                min={5}
                step={5}
                value={draft.durationMinutes}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    durationMinutes: Math.max(5, Number(e.target.value) || 30),
                  })
                }
                className={`h-10 ${fieldClass}`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="book-call-title">
              TITLE
            </label>
            <input
              id="book-call-title"
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
              className={`h-10 ${fieldClass}`}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="book-call-attendees">
              ATTENDEES
            </label>
            <input
              id="book-call-attendees"
              value={draft.attendees}
              onChange={(e) => onChange({ ...draft, attendees: e.target.value })}
              placeholder="buyer@…, you@…"
              className={`h-10 ${fieldClass} font-mono text-[12px]`}
            />
            <p className="mt-1 text-[10.5px] text-muted">
              Comma-separated. Calendar&apos;s auto-add can be unreliable — check Guests after open.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="book-call-details">
              DESCRIPTION
            </label>
            <textarea
              id="book-call-details"
              value={draft.details}
              onChange={(e) => onChange({ ...draft, details: e.target.value })}
              rows={8}
              className={`${fieldClass} min-h-[140px] resize-y font-sans leading-relaxed`}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="book-call-notes">
              NOTES (OPTIONAL)
            </label>
            <textarea
              id="book-call-notes"
              value={draft.notes}
              onChange={(e) => onChange({ ...draft, notes: e.target.value })}
              rows={3}
              placeholder="Anything extra for the invite…"
              className={`${fieldClass} resize-y`}
            />
          </div>

          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <PressableButton
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink hover:border-accent disabled:opacity-60"
          >
            Cancel
          </PressableButton>
          <PressableButton
            pending={pending}
            pendingLabel="Opening…"
            onClick={openTemplate}
            disabled={!draft.title.trim() || !draft.startLocal}
            className="inline-flex h-9 items-center rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            Open in Calendar
          </PressableButton>
        </div>
      </div>
    </div>
  );
}
