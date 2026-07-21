"use client";

import { useState, useTransition } from "react";
import { PressableButton } from "@/components/PressableButton";

/**
 * Direct "open curation view" access from an order — no Google Calendar popup,
 * just the working curation session (created from this order's items on first
 * use, reused after that). Complements BookCallButton, which is for scheduling
 * a call; this is for staff who just want to jump into curation right now.
 */
export function OpenCurationViewButton({
  quoteId,
  initialSellerCurationUrl,
}: {
  quoteId: string;
  initialSellerCurationUrl?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sellerCurationUrl, setSellerCurationUrl] = useState<string | null>(
    initialSellerCurationUrl || null,
  );

  return (
    <div>
      <PressableButton
        pending={pending}
        pendingLabel="Opening…"
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await fetch(`/api/staff/quotes/${quoteId}/curation`, {
              method: "POST",
              credentials: "same-origin",
            });
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              sellerCurationUrl?: string;
            };
            if (!res.ok || data.error || !data.sellerCurationUrl) {
              setError(data.error || "Could not open curation view.");
              return;
            }
            setSellerCurationUrl(data.sellerCurationUrl);
            window.open(data.sellerCurationUrl, "_blank", "noopener,noreferrer");
          });
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-chip border border-border bg-surface px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink hover:border-accent disabled:opacity-60"
      >
        Open curation view →
      </PressableButton>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {sellerCurationUrl ? (
        <p className="mt-2 text-[11px] text-muted">
          Reopen anytime:{" "}
          <a
            href={sellerCurationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            curation view
          </a>
        </p>
      ) : null}
    </div>
  );
}
