"use client";

import { useTransition } from "react";
import { archiveSuggestedLotAction } from "@/lib/actions/bundles-firestore";

export function ArchiveLotButton({ lotId }: { lotId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => archiveSuggestedLotAction(lotId))}
      className="text-[11px] uppercase tracking-[0.1em] text-muted hover:text-danger disabled:opacity-50"
    >
      {pending ? "…" : "Archive"}
    </button>
  );
}
