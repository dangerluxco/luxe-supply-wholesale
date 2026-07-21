"use client";

import { useState, useTransition } from "react";
import { PressableButton } from "@/components/PressableButton";
import { DraftEmailModal } from "@/components/DraftEmailModal";

/**
 * "Message buyer" on the staff client detail page — draft preview, then send
 * via SendGrid (reply-to the staff user) or mailto fallback.
 */
export function MessageBuyerButton({
  buyerId,
  disabled,
}: {
  buyerId: string;
  disabled?: boolean;
}) {
  const [pendingPreview, startPreview] = useTransition();
  const [pendingSend, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);

  function openDraft() {
    setError(null);
    setModalError(null);
    startPreview(async () => {
      const res = await fetch(`/api/staff/buyers/${encodeURIComponent(buyerId)}/message`, {
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
      const res = await fetch(`/api/staff/buyers/${encodeURIComponent(buyerId)}/message`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, body: draft.body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        mailto?: string;
      };
      if (!res.ok || data.error) {
        setModalError(data.error || "Could not send the message.");
        return;
      }
      setDraft(null);
      if (!data.sent && data.mailto) {
        window.location.href = data.mailto;
      }
    });
  }

  return (
    <div>
      <PressableButton
        pending={pendingPreview}
        pendingLabel="Preparing…"
        disabled={disabled}
        title={disabled ? "No email on file for this buyer" : undefined}
        onClick={openDraft}
        className="inline-flex h-9 items-center rounded-chip border border-border px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition hover:border-accent disabled:opacity-60"
      >
        Message buyer
      </PressableButton>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}

      {draft ? (
        <DraftEmailModal
          title="Message buyer"
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
