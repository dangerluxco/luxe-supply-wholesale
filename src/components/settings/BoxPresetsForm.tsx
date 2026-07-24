"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoxPreset } from "@/lib/firestore/settings";

const field =
  "h-9 rounded-chip border border-border bg-ground px-2.5 font-mono text-[12px] text-ink outline-none focus:border-accent";

/**
 * Org-wide standard box sizes — the pack station's box dropdown offers these
 * to every shipper (on top of any personal per-browser presets).
 */
export function BoxPresetsForm({ initial }: { initial: BoxPreset[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<BoxPreset[]>(
    initial.length ? initial : [{ name: "", weight: "", l: "", w: "", h: "" }],
  );
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, key: keyof BoxPreset, value: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  function save() {
    setMessage(null);
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "boxes",
          boxPresets: rows.filter((r) => r.name.trim()),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save box sizes.");
        return;
      }
      setMessage(data.message || "Standard box sizes saved.");
      router.refresh();
    });
  }

  return (
    <div className="mt-8 max-w-2xl space-y-3">
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
        STANDARD BOX SIZES
      </div>
      <p className="text-[12px] text-secondary">
        These appear in every pack station&apos;s box-size dropdown — dims prefill and rates can
        be fetched per box. Weight is the empty box in ounces (optional).
      </p>
      <div className="grid grid-cols-[1.4fr_70px_58px_58px_58px_50px] gap-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
        <span>Name</span>
        <span>Wt (oz)</span>
        <span>L (in)</span>
        <span>W (in)</span>
        <span>H (in)</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.4fr_70px_58px_58px_58px_50px] items-center gap-2">
          <input
            value={r.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder="Small box"
            className={field}
          />
          <input value={r.weight} onChange={(e) => update(i, "weight", e.target.value)} inputMode="numeric" className={field} />
          <input value={r.l} onChange={(e) => update(i, "l", e.target.value)} inputMode="decimal" className={field} />
          <input value={r.w} onChange={(e) => update(i, "w", e.target.value)} inputMode="decimal" className={field} />
          <input value={r.h} onChange={(e) => update(i, "h", e.target.value)} inputMode="decimal" className={field} />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
            className="text-[11px] text-muted hover:text-danger"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { name: "", weight: "", l: "", w: "", h: "" }])}
          className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink"
        >
          + Add box size
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save box sizes"}
        </button>
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
        {message ? <span className="text-[12px] text-[#4E9A6A]">{message}</span> : null}
      </div>
    </div>
  );
}
