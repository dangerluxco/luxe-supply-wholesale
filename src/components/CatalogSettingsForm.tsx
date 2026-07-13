"use client";

import { useActionState } from "react";
import { saveCatalogSettings } from "@/lib/actions/portal";

export function CatalogSettingsForm({
  mode,
  skus,
}: {
  mode: string;
  skus: string[];
}) {
  const [state, action, pending] = useActionState(saveCatalogSettings, {
    error: "",
    message: "",
  } as { error?: string; message?: string; ok?: boolean });

  return (
    <form action={action} className="mt-6 max-w-2xl space-y-4 rounded-card border border-border bg-surface p-6">
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">CATALOG SELECTION</div>
      <p className="text-[12.5px] text-secondary">
        Controls which SKUs appear on the buyer storefront. Writes directly to the LuxeSupply org in Firestore.
      </p>

      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="radio" name="mode" value="all" defaultChecked={mode !== "sku_list"} />
        All catalog products
      </label>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="radio" name="mode" value="sku_list" defaultChecked={mode === "sku_list"} />
        SKU allowlist only
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">SKUS (ONE PER LINE OR COMMA-SEPARATED)</span>
        <textarea
          name="skus"
          rows={8}
          defaultValue={skus.join("\n")}
          className="rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
        />
      </label>

      {state?.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-[12px] text-[#4E9A6A]">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save catalog settings"}
      </button>
    </form>
  );
}
