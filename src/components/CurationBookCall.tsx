"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CopyRow } from "@/components/CopyRow";
import { InfoTip } from "@/components/InfoTip";
import { PressableButton } from "@/components/PressableButton";
import { DraftEmailModal } from "@/components/DraftEmailModal";
import {
  BookCallEventModal,
  bookCallDraftFromApi,
  type BookCallEventDraft,
} from "@/components/BookCallEventModal";
import { fullDate } from "@/lib/format";

type BuyerHit = { id: string; displayName: string; username: string; email: string; company: string };

/**
 * Client-call controls for an ad-hoc curation session (no order request yet):
 * Request a call (draft preview → email buyer for times + curation link) →
 * Book call (event modal → Calendar) → staff starts the live session below.
 */
export function CurationBookCall({
  token,
  linkedBuyerId,
  initialCallRequestedAt,
}: {
  token: string;
  linkedBuyerId: string | null;
  initialCallRequestedAt?: string | null;
}) {
  const hasLinkedBuyer = !!linkedBuyerId;
  const [pendingPreview, startPreview] = useTransition();
  const [pendingSend, startSend] = useTransition();
  const [pendingBook, startBook] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BuyerHit[]>([]);
  const [selected, setSelected] = useState<BuyerHit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(initialCallRequestedAt || null);
  const [viaMailto, setViaMailto] = useState(false);
  const [result, setResult] = useState<{ curationUrl: string; sellerCurationUrl: string } | null>(
    null,
  );
  const [emailDraft, setEmailDraft] = useState<{ to: string; subject: string; body: string } | null>(
    null,
  );
  const [bookDraft, setBookDraft] = useState<BookCallEventDraft | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/staff/buyers/search?q=${encodeURIComponent(query.trim())}`, {
        credentials: "same-origin",
      })
        .then((res) => res.json())
        .then((data: { buyers?: BuyerHit[] }) => setResults(data.buyers || []))
        .catch(() => setResults([]));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  function pick(b: BuyerHit) {
    setSelected(b);
    setQuery(`${b.displayName || b.username} (@${b.username})`);
    setResults([]);
  }

  function openRequestDraft() {
    const buyerId = selected?.id || linkedBuyerId;
    if (!buyerId) return;
    setError(null);
    setModalError(null);
    startPreview(async () => {
      const res = await fetch(`/api/staff/curation/${token}/request-call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId, preview: true }),
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
      setEmailDraft({ to: data.to, subject: data.subject, body: data.body });
    });
  }

  function confirmSendEmail() {
    if (!emailDraft) return;
    const buyerId = selected?.id || linkedBuyerId;
    if (!buyerId) return;
    setModalError(null);
    startSend(async () => {
      const res = await fetch(`/api/staff/curation/${token}/request-call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId,
          subject: emailDraft.subject,
          body: emailDraft.body,
        }),
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
      setEmailDraft(null);
      if (!data.sent && data.mailto) {
        setViaMailto(true);
        window.location.href = data.mailto;
      }
    });
  }

  function openBookModal() {
    const buyerId = selected?.id || linkedBuyerId;
    if (!buyerId) return;
    setError(null);
    setModalError(null);
    startBook(async () => {
      const res = await fetch(`/api/staff/curation/${token}/book-call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId }),
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
      setResult({ curationUrl: data.curationUrl || "", sellerCurationUrl: data.sellerCurationUrl });
      setBookDraft(bookCallDraftFromApi(data.event));
    });
  }

  const canAct = !!(selected?.id || linkedBuyerId);

  return (
    <div className="rounded-card border border-accent/30 bg-surface p-6">
      <div className="mb-3 flex items-center gap-1.5">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">CLIENT CALL</div>
        <InfoTip label="Requesting vs booking a call">
          Request a call first — it shows an email draft you can edit, then emails the buyer with
          this curation link asking for times (replies go straight to you). Once they answer, Book
          call opens an event editor, then Google Calendar with the buyer as guest. When you&apos;re
          on together, use Start call in the live section below.
        </InfoTip>
      </div>
      <p className="text-[12.5px] text-secondary">
        This session isn&apos;t tied to an order request yet. Request times from the buyer, book
        the invite when you have a slot, then start the live curation when you&apos;re on the call.
      </p>

      {!hasLinkedBuyer && !selected ? (
        <p className="mt-2 text-[11.5px] text-muted">
          Pick a portal buyer to enable Request a call and Book call (needs their email).
        </p>
      ) : hasLinkedBuyer && !selected ? (
        <p className="mt-2 text-[11.5px] text-[#4E9A6A]">
          A buyer is linked to this session — request or book below. Search only if you need to
          change who.
        </p>
      ) : null}

      <div className="relative mt-4 max-w-sm">
        <label className="mb-1.5 block micro-badge text-[10px] tracking-[0.14em] text-muted">
          {hasLinkedBuyer ? "CHANGE BUYER (OPTIONAL)" : "PICK BUYER"}
        </label>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search buyers by name, username, or email…"
          className="h-10 w-full rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
        />
        {results.length > 0 ? (
          <div className="absolute z-10 mt-1 w-full rounded-chip border border-border bg-surface shadow-[0_12px_32px_-16px_rgba(22,22,26,0.35)]">
            {results.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => pick(b)}
                className="block w-full px-3 py-2 text-left transition hover:bg-ground"
              >
                <div className="text-[12px] text-ink">{b.displayName || b.username}</div>
                <div className="font-mono text-[10.5px] text-muted">
                  {b.email || `@${b.username}`}
                  {b.company ? ` · ${b.company}` : ""}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-2">
        <div>
          <PressableButton
            pending={pendingPreview}
            pendingLabel="Preparing…"
            disabled={!canAct}
            onClick={openRequestDraft}
            className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink hover:border-accent disabled:opacity-60"
          >
            {requestedAt ? "Request again" : "Request a call"}
          </PressableButton>
          {requestedAt ? (
            <p className="mt-2 max-w-xs text-[11px] text-muted">
              {viaMailto ? "Email drafted" : "Call requested"} {fullDate(requestedAt)} — buyer will
              reply with times, then book the call here.
            </p>
          ) : null}
        </div>
        <div>
          <PressableButton
            pending={pendingBook}
            pendingLabel="Preparing…"
            disabled={!canAct}
            onClick={openBookModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {result ? "Book another call" : "Book call"}
          </PressableButton>
        </div>
      </div>

      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-1.5 text-[11px] text-muted">
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
            <a
              href={result.curationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Buyer link →
            </a>
          </p>
          {selected?.email ? (
            <>
              <CopyRow label="Buyer email:" value={selected.email} />
              <p className="text-[10.5px] text-muted">
                We&apos;ve added them as a guest, but Calendar&apos;s auto-add can be
                unreliable — paste their email into Guests if it didn&apos;t stick.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {emailDraft ? (
        <DraftEmailModal
          to={emailDraft.to}
          subject={emailDraft.subject}
          body={emailDraft.body}
          pending={pendingSend}
          error={modalError}
          onSubjectChange={(subject) => setEmailDraft({ ...emailDraft, subject })}
          onBodyChange={(body) => setEmailDraft({ ...emailDraft, body })}
          onCancel={() => {
            setEmailDraft(null);
            setModalError(null);
          }}
          onConfirm={confirmSendEmail}
        />
      ) : null}

      {bookDraft ? (
        <BookCallEventModal
          draft={bookDraft}
          error={modalError}
          onChange={setBookDraft}
          onCancel={() => {
            setBookDraft(null);
            setModalError(null);
          }}
          onConfirm={(calendarUrl) => {
            setBookDraft(null);
            window.open(calendarUrl, "_blank", "noopener,noreferrer");
          }}
        />
      ) : null}
    </div>
  );
}
