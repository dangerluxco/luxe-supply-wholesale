"use client";

import { useState, useTransition } from "react";
import { fullDate } from "@/lib/format";

/**
 * "Request a call" — emails the buyer asking for a few times that work
 * (reply-to the rep). Once they answer, the rep uses Book Call next to it.
 * Persisted on the order request, so the "requested" state survives reloads.
 */
export function RequestCallButton({
  quoteId,
  initialRequestedAt,
}: {
  quoteId: string;
  initialRequestedAt?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(initialRequestedAt || null);
  const [viaMailto, setViaMailto] = useState(false);

  function requestCall() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/request-call`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: boolean;
        mailto?: string;
        requestedAt?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not send the call request.");
        return;
      }
      setRequestedAt(data.requestedAt || new Date().toISOString());
      if (!data.sent && data.mailto) {
        // No email provider configured — open a prefilled draft in the rep's own client.
        setViaMailto(true);
        window.location.href = data.mailto;
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={requestCall}
        className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:border-accent disabled:opacity-60"
      >
        {pending ? "Sending…" : requestedAt ? "Request again" : "Request a call"}
      </button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {requestedAt ? (
        <p className="mt-2 text-[11px] text-muted">
          {viaMailto ? "Email drafted" : "Call requested"} {fullDate(requestedAt)} — buyer will
          reply with times, then book the call here.
        </p>
      ) : null}
    </div>
  );
}
