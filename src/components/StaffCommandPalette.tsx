"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { clsx } from "@/lib/clsx";

type Hit = { id: string; title: string; subtitle: string; href: string };
type Group = { label: string; hits: Hit[] };

/** RepSidebar's search button opens the palette through this event. */
export const OPEN_STAFF_SEARCH_EVENT = "luxe:open-staff-search";

/**
 * Global ⌘K / Ctrl+K search palette for the staff portal — searches clients,
 * order requests, invoices, bundles, catalog SKUs, and staff via
 * /api/staff/search. Mounted once in the rep layout so it works on every page.
 * Navigation is a hard window.location.assign, consistent with the console's
 * hard-nav convention.
 */
export function StaffCommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const flatHits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQ("");
    setGroups([]);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setQ("");
            setGroups([]);
            setActiveIndex(0);
          }
          return !v;
        });
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpenEvent() {
      openPalette();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_STAFF_SEARCH_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_STAFF_SEARCH_EVENT, onOpenEvent);
    };
  }, [openPalette]);

  useEffect(() => {
    if (open) {
      // Wait a tick for the input to mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      try {
        const res = await fetch(`/api/staff/search?q=${encodeURIComponent(term)}`, {
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as { groups?: Group[] };
        if (seq === requestSeq.current) {
          setGroups(data.groups || []);
          setActiveIndex(0);
        }
      } catch {
        if (seq === requestSeq.current) setGroups([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatHits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flatHits[activeIndex];
      if (hit) window.location.assign(hit.href);
    }
  }

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/40 p-6 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[620px] max-w-full overflow-hidden rounded-card border border-border bg-surface shadow-[0_24px_80px_-24px_rgba(22,22,26,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search sellers, invoices, bundles, SKUs…"
            className="h-12 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="shrink-0 rounded border border-border bg-ground px-1.5 py-0.5 font-mono text-[10px] text-muted">
            ESC
          </span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted">
              Type at least 2 characters — clients, order requests, invoices, bundles, catalog
              SKUs, and staff all match.
            </p>
          ) : loading && groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted">Searching…</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-muted">
              No matches for “{q.trim()}”.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-1">
                <div className="micro-badge px-3 pb-1 pt-2 text-[9.5px] tracking-[0.14em] text-muted">
                  {g.label.toUpperCase()}
                </div>
                {g.hits.map((hit) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  const index = runningIndex;
                  return (
                    <a
                      key={`${g.label}-${hit.id}`}
                      href={hit.href}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={clsx(
                        "block rounded-chip px-3 py-2 transition",
                        isActive ? "bg-ground" : "hover:bg-ground/60",
                      )}
                    >
                      <div className="truncate text-[13px] font-medium text-ink">{hit.title}</div>
                      <div className="truncate font-mono text-[10.5px] text-muted">{hit.subtitle}</div>
                    </a>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 font-mono text-[10px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
