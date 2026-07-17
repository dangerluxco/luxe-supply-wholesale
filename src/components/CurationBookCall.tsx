"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type BuyerHit = { id: string; displayName: string; username: string; email: string; company: string };

/**
 * "Book call" for an ad-hoc curation session that isn't tied to an order
 * request yet — pick the buyer this list is for, then book the call the same
 * way the order-based flow does. Once the call ends, an order request gets
 * created from whatever the buyer approved (staff confirms that step).
 */
export function CurationBookCall({
  token,
  hasLinkedBuyer,
}: {
  token: string;
  hasLinkedBuyer: boolean;
}) {
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BuyerHit[]>([]);
  const [selected, setSelected] = useState<BuyerHit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ curationUrl: string; sellerCurationUrl: string } | null>(
    null,
  );
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

  function bookCall() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${token}/book-call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId: selected.id }),
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
      setResult({ curationUrl: data.curationUrl || "", sellerCurationUrl: data.sellerCurationUrl });
      window.open(data.calendarUrl, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="rounded-card border border-accent/30 bg-surface p-6">
      <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">BOOK CALL</div>
      <p className="text-[12.5px] text-secondary">
        This session isn&apos;t tied to an order request yet. Pick the buyer you&apos;re curating
        this for, then book the call — you&apos;ll get the option to create an order request from
        whatever they approve once the call ends.
      </p>
      {hasLinkedBuyer && !selected ? (
        <p className="mt-2 text-[11.5px] text-[#4E9A6A]">
          A buyer is already linked to this session — search again only if you need to change who.
        </p>
      ) : null}

      <div className="relative mt-3 max-w-sm">
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

      <button
        type="button"
        disabled={pending || !selected}
        onClick={bookCall}
        className="mt-3 h-10 rounded-chip bg-ink px-5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Preparing…" : "Book call"}
      </button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-1 text-[11px] text-muted">
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
