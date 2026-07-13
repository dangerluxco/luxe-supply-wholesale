"use client";

import { useState } from "react";
import { createLead } from "@/lib/actions/rep";

export function NewLeadForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center gap-3 rounded-card border border-dashed border-border px-5 py-4 text-[12px] text-muted transition hover:border-accent"
      >
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-border text-[13px]">
          +
        </span>
        Add a lead — it auto-routes by tier the moment you save.
      </button>
    );
  }

  return (
    <form
      action={createLead}
      onSubmit={() => setTimeout(() => setOpen(false), 50)}
      className="mt-4 grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1.4fr_1fr_120px_auto]"
    >
      <input
        name="accountName"
        required
        placeholder="Account name"
        className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <input
        name="industry"
        placeholder="Industry"
        className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <input
        name="estAnnualSpend"
        type="number"
        required
        placeholder="Est. $/yr"
        className="h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button className="h-10 rounded-chip bg-ink px-4 text-[11px] uppercase tracking-[0.12em] text-ground">
          Route it
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 rounded-chip border border-border px-3 text-[11px] uppercase tracking-[0.12em] text-muted"
        >
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-muted sm:col-span-4">
        Tier is derived from spend (T1 ≥ $50k · T2 $10–50k · T3 &lt; $10k). Tier 1 → senior reps;
        Tier 2/3 → round-robin by load.
      </p>
    </form>
  );
}
