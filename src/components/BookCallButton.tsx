"use client";

import { useState, useTransition } from "react";
import { CopyRow } from "@/components/CopyRow";
import { PressableButton } from "@/components/PressableButton";
import {
  BookCallEventModal,
  bookCallDraftFromApi,
  type BookCallEventDraft,
} from "@/components/BookCallEventModal";

type BookCallResult = { curationUrl: string; sellerCurationUrl: string };

/** In-app links must stay on the current domain — absolute STAFF_ORIGIN URLs
 *  (meant for emails/calendar) would drop the rep onto a domain without their
 *  session cookie. Buyer-facing links stay absolute (different site by design). */
function toAppPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Spins up a fresh curation link from this order request's items, then opens an
 * in-portal event editor (date/time, title, description, attendees, notes).
 * Confirm opens a pre-filled Google Calendar template — Calendar API create
 * isn't wired (staff OAuth is sign-in only).
 */
export function BookCallButton({
  quoteId,
  buyerEmail,
  initialCurationUrl,
  initialSellerCurationUrl,
}: {
  quoteId: string;
  buyerEmail?: string | null;
  initialCurationUrl?: string | null;
  initialSellerCurationUrl?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookCallResult | null>(
    initialCurationUrl && initialSellerCurationUrl
      ? { curationUrl: initialCurationUrl, sellerCurationUrl: initialSellerCurationUrl }
      : null,
  );
  const [bookDraft, setBookDraft] = useState<BookCallEventDraft | null>(null);

  function openBookModal() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/quotes/${quoteId}/book-call`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        curationUrl?: string;
        sellerCurationUrl?: string;
        event?: {
          title: string;
          details: string;
          guestEmails: string[];
          startIso: string;
          durationMinutes: number;
        };
      };
      if (!res.ok || data.error || !data.sellerCurationUrl || !data.event) {
        setError(data.error || "Could not prepare the call.");
        return;
      }
      setResult({
        curationUrl: data.curationUrl || "",
        sellerCurationUrl: data.sellerCurationUrl,
      });
      setBookDraft(bookCallDraftFromApi(data.event));
    });
  }

  return (
    <div>
      <PressableButton
        pending={pending}
        pendingLabel="Preparing…"
        onClick={openBookModal}
        className="inline-flex h-9 items-center gap-1.5 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {result ? "Book another call" : "Book call"}
      </PressableButton>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {result ? (
        <div className="mt-2 space-y-1.5 text-[11px] text-muted">
          <p>
            <a
              href={toAppPath(result.sellerCurationUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              Open seller curation view →
            </a>
          </p>
          <p>
            <a
              href={result.curationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Buyer link →
            </a>
          </p>
          {buyerEmail ? (
            <>
              <CopyRow label="Buyer email:" value={buyerEmail} />
              <p className="text-[10.5px] text-muted">
                We&apos;ve added them as a guest, but Calendar&apos;s auto-add can be
                unreliable — paste their email into Guests if it didn&apos;t stick.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {bookDraft ? (
        <BookCallEventModal
          draft={bookDraft}
          onChange={setBookDraft}
          onCancel={() => setBookDraft(null)}
          onConfirm={(calendarUrl) => {
            setBookDraft(null);
            window.open(calendarUrl, "_blank", "noopener,noreferrer");
          }}
        />
      ) : null}
    </div>
  );
}
