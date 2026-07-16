"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { archiveSuggestedLotAction } from "@/lib/actions/archive-lot";

export function ArchiveLotButton({ lotId }: { lotId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await archiveSuggestedLotAction(lotId);
          router.refresh();
        })
      }
      className="text-[11px] uppercase tracking-[0.1em] text-muted hover:text-danger disabled:opacity-50"
    >
      {pending ? "…" : "Archive"}
    </button>
  );
}
