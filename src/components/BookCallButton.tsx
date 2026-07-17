"use client";

import { useState, useTransition } from "react";

type BookCallResult = { curationUrl: string; sellerCurationUrl: string };

/**
 * Spins up a fresh curation link from this order request's items, then opens a
 * pre-filled Google Calendar event (buyer as guest, curation link + order summary
 * in the description) plus the rep's own curation manager for that same link —
 * so a rep can go straight from "book the call" to "run the call".
 */
export function BookCallButton({ quoteId }: { quoteId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookCallResult | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch(`/api/staff/quotes/${quoteId}/book-call`, {
              method: "POST",
              credentials: "same-origin",
            });
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              calendarUrl?: string;
              curationUrl?: string;
              sellerCurationUrl?: string;
            };
            if (!res.ok || data.error || !data.calendarUrl || !data.sellerCurationUrl) {
              setError(data.error || "Could not prepare the call.");
              return;
            }
            setResult({
              curationUrl: data.curationUrl || "",
              sellerCurationUrl: data.sellerCurationUrl,
            });
            // Calendar first (buyer invite + buyer-facing link), then straight into the
            // seller's own curation manager for this same link — the rep's next step.
            window.open(data.calendarUrl, "_blank", "noopener,noreferrer");
            window.open(data.sellerCurationUrl, "_blank", "noopener,noreferrer");
          });
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground transition disabled:opacity-60"
      >
        {pending ? "Preparing…" : "Book call"}
      </button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {result ? (
        <div className="mt-2 space-y-1 text-[11px] text-muted">
          <p>
            <a
              href={result.sellerCurationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              Open seller curation view →
            </a>
          </p>
          <p>
            Buyer link:{" "}
            <a
              href={result.curationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              {result.curationUrl}
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
