"use client";

import { useState, useTransition } from "react";
import { requestPieceCall } from "@/lib/actions/request-piece-call";

/**
 * Buyer call-request action. Two modes:
 * - PDP: `{ sku, title }` — "Request a call about this piece"
 * - Cart: `{ cart: true }` — "Request a call about these pieces" (server reads
 *   the cart contents; title is display-only)
 * Opens a small modal for preferred times + a note, submits via server action,
 * and confirms inline.
 */
export function RequestPieceCallButton({
  sku,
  title,
  cart = false,
}: {
  sku?: string;
  title: string;
  cart?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [preferredTimes, setPreferredTimes] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (confirmed) {
    return (
      <div className="rounded-chip border border-accent/40 bg-accent/5 px-4 py-3 text-[12.5px] text-[#6E5A30]">
        Request received — we&apos;ll reach out shortly to set up a call.
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[44px] w-full items-center justify-center gap-2 rounded-chip border border-accent bg-accent/5 text-[12px] uppercase tracking-[0.14em] text-[#6E5A30] transition hover:bg-accent/10"
      >
        ◉ {cart ? "Request a call about these pieces" : "Request a call about this piece"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[440px] max-w-full rounded-card border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="micro-badge mb-1 text-[10px] tracking-[0.14em] text-accent">
              REQUEST A CALL
            </div>
            <div className="mb-4 text-[14px] font-semibold text-ink">{title}</div>

            <label className="mb-3 flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                Times that work for you (optional)
              </span>
              <input
                value={preferredTimes}
                onChange={(e) => setPreferredTimes(e.target.value)}
                placeholder="e.g. Tue or Wed afternoon EST"
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="mb-4 flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                Anything specific you&apos;d like to see? (optional)
              </span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Condition details, provenance, comparisons…"
                className="rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
              />
            </label>

            {error ? <div className="mb-3 text-[11.5px] text-danger">{error}</div> : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const res = await requestPieceCall({ sku, title, cart, preferredTimes, note });
                    if (res.error) {
                      setError(res.error);
                      return;
                    }
                    setOpen(false);
                    setConfirmed(true);
                  });
                }}
                className="h-10 flex-1 rounded-chip bg-ink text-[11px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send request"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-chip border border-border px-4 text-[11px] uppercase tracking-[0.14em] text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
