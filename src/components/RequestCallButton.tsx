"use client";

import { useState, useTransition } from "react";
import { fullDate } from "@/lib/format";
import { PressableButton } from "@/components/PressableButton";
import { DraftEmailModal } from "@/components/DraftEmailModal";

/**
 * "Request a call" — draft preview, then email the buyer asking for times
 * (reply-to the rep). Once they answer, the rep uses Book Call next to it.
 */
export function RequestCallButton({
  quoteId,
  initialRequestedAt,
}: {
  quoteId: string;
  initialRequestedAt?: string | null;
}) {
  const [pendingPreview, startPreview] = useTransition();
  const [pendingSend, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(initialRequestedAt || null);
  const [viaMailto, setViaMailto] = useState(false);
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);

  function openDraft() {
    setError(null);
    setModalError(null);
    startPreview(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/request-call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        to?: string;
        subject?: string;
        body?: string;
      };
      if (!res.ok || data.error || !data.to || !data.subject || !data.body) {
        setError(data.error || "Could not prepare the email draft.");
        return;
      }
      setDraft({ to: data.to, subject: data.subject, body: data.body });
    });
  }

  function confirmSend() {
    if (!draft) return;
    setModalError(null);
    startSend(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/request-call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, body: draft.body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        mailto?: string;
        requestedAt?: string;
      };
      if (!res.ok || data.error) {
        setModalError(data.error || "Could not send the call request.");
        return;
      }
      setRequestedAt(data.requestedAt || new Date().toISOString());
      setDraft(null);
      if (!data.sent && data.mailto) {
        setViaMailto(true);
        window.location.href = data.mailto;
      }
    });
  }

  return (
    <div>
      <PressableButton
        pending={pendingPreview}
        pendingLabel="Preparing…"
        onClick={openDraft}
        className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink hover:border-accent disabled:opacity-60"
      >
        {requestedAt ? "Request again" : "Request a call"}
      </PressableButton>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {requestedAt ? (
        <p className="mt-2 text-[11px] text-muted">
          {viaMailto ? "Email drafted" : "Call requested"} {fullDate(requestedAt)} — buyer will
          reply with times, then book the call here.
        </p>
      ) : null}

      {draft ? (
        <DraftEmailModal
          to={draft.to}
          subject={draft.subject}
          body={draft.body}
          pending={pendingSend}
          error={modalError}
          onSubjectChange={(subject) => setDraft({ ...draft, subject })}
          onBodyChange={(body) => setDraft({ ...draft, body })}
          onCancel={() => {
            setDraft(null);
            setModalError(null);
          }}
          onConfirm={confirmSend}
        />
      ) : null}
    </div>
  );
}
