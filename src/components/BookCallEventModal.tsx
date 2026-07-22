"use client";

import { useState } from "react";
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  function eventPayload() {
    const start = new Date(draft.startLocal);
    if (Number.isNaN(start.getTime())) return null;
    const guestEmails = draft.attendees
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const notes = draft.notes.trim();
    const details = notes ? `${draft.details.trim()}\n\nNotes:\n${notes}` : draft.details.trim();
    return { start, guestEmails, details, title: draft.title.trim() || "Call" };
  }

  async function createEvent() {
    const p = eventPayload();
    if (!p) return;
    setCreating(true);
    setCreateError(null);
    setNeedsConnect(false);
    try {
      const res = await fetch("/api/staff/calendar/create-event", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: p.title,
          details: p.details,
          startIso: p.start.toISOString(),
          durationMinutes: draft.durationMinutes,
          guestEmails: p.guestEmails,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        needsConnect?: boolean;
        htmlLink?: string;
      };
      if (data.needsConnect) {
        setNeedsConnect(true);
        return;
      }
      if (!res.ok || data.error) {
        setCreateError(data.error || "Could not create the event.");
        return;
      }
      setCreated(data.htmlLink || "");
    } finally {
      setCreating(false);
    }
  }

  function openTemplate() {
    const p = eventPayload();
    if (!p) return;
    onConfirm(
      buildGoogleCalendarUrl({
        title: p.title,
        details: p.details,
        guestEmails: p.guestEmails,
        start: p.start,
        durationMinutes: draft.durationMinutes,
      }),
    );
  }

  function connectCalendar() {
    const next =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/wholesaleportal/rep";
    window.location.href = `/api/staff/calendar/connect?next=${encodeURIComponent(next)}`;
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
            Set the event details, then create the invite — it lands on your Google Calendar
            and emails every attendee automatically.
          </p>

          {created != null ? (
            <div className="rounded-chip border border-accent/50 bg-accent/10 px-4 py-3 text-[12.5px] text-ink">
              Event created — invites are on their way to all attendees.{" "}
              {created ? (
                <a
                  href={created}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent underline"
                >
                  Open in Calendar →
                </a>
              ) : null}
            </div>
          ) : null}

          {needsConnect ? (
            <div className="rounded-chip border border-accent/50 bg-accent/10 px-4 py-3 text-[12.5px]">
              <div className="mb-2 text-ink">
                Connect your Google Calendar once and future calls book with one click. You&apos;ll
                see a Google screen saying the app is unverified — click{" "}
                <span className="font-semibold">Advanced → Continue</span> (one time only).
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={connectCalendar}
                  className="h-8 rounded-chip bg-ink px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ground hover:opacity-90"
                >
                  Connect Google Calendar
                </button>
                <button
                  type="button"
                  onClick={openTemplate}
                  className="h-8 rounded-chip border border-border px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-secondary hover:border-accent hover:text-ink"
                >
                  Use pre-filled Calendar instead
                </button>
              </div>
            </div>
          ) : null}

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

          {error || createError ? (
            <p className="text-[12px] text-danger">{error || createError}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <PressableButton
            onClick={onCancel}
            disabled={pending || creating}
            className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink hover:border-accent disabled:opacity-60"
          >
            {created != null ? "Done" : "Cancel"}
          </PressableButton>
          {created == null ? (
            <>
              <PressableButton
                onClick={openTemplate}
                disabled={pending || creating || !draft.title.trim() || !draft.startLocal}
                className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary hover:border-accent hover:text-ink disabled:opacity-60"
              >
                Open in Calendar
              </PressableButton>
              <PressableButton
                pending={creating}
                pendingLabel="Creating…"
                onClick={createEvent}
                disabled={pending || !draft.title.trim() || !draft.startLocal}
                className="inline-flex h-9 items-center rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
              >
                Create event + send invites
              </PressableButton>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
