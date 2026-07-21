"use client";

import { PressableButton } from "@/components/PressableButton";

const fieldClass =
  "w-full rounded-chip border border-border bg-ground px-3 py-2 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge mb-1.5 block text-[10px] tracking-[0.14em] text-muted";

/**
 * Staff review step before sending a "Request a call" email — edit subject/body,
 * then Confirm send (or Cancel). Matches CreateLeadModal shell styling.
 */
export function DraftEmailModal({
  title = "Review call request email",
  to,
  subject,
  body,
  pending,
  error,
  onSubjectChange,
  onBodyChange,
  onCancel,
  onConfirm,
}: {
  title?: string;
  to: string;
  subject: string;
  body: string;
  pending?: boolean;
  error?: string | null;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onCancel} className="text-[12px] text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <div className={labelClass}>TO</div>
            <div className="font-mono text-[12.5px] text-ink">{to}</div>
          </div>
          <div>
            <label className={labelClass} htmlFor="draft-email-subject">
              SUBJECT
            </label>
            <input
              id="draft-email-subject"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className={`h-10 ${fieldClass}`}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="draft-email-body">
              BODY
            </label>
            <textarea
              id="draft-email-body"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={12}
              className={`${fieldClass} min-h-[220px] resize-y font-sans leading-relaxed`}
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
            pendingLabel="Sending…"
            onClick={onConfirm}
            disabled={!subject.trim() || !body.trim()}
            className="inline-flex h-9 items-center rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            Send email
          </PressableButton>
        </div>
      </div>
    </div>
  );
}
