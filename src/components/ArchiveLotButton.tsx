"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PressableButton } from "@/components/PressableButton";

/** Archive lot via fetch API — no `"use server"` (soft-nav safe). */
export function ArchiveLotButton({ lotId }: { lotId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <PressableButton
      pending={pending}
      pendingLabel="Archiving…"
      onClick={() =>
        start(async () => {
          const res = await fetch(
            `/api/staff/bundles/${encodeURIComponent(lotId)}/archive`,
            { method: "POST", credentials: "same-origin" },
          );
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            alert(data.error || "Could not archive lot.");
            return;
          }
          router.refresh();
        })
      }
      className="text-[11px] uppercase tracking-[0.1em] text-muted hover:text-danger disabled:opacity-50"
    >
      Archive
    </PressableButton>
  );
}
