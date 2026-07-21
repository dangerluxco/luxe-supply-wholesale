"use client";

import { useState } from "react";
import type { PortalBuyer } from "@/lib/firestore/buyers";
import { EditClientAccountModal } from "@/components/EditClientAccountModal";

export function EditClientAccountButton({ buyer }: { buyer: PortalBuyer }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-chip border border-border px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition hover:border-accent"
      >
        Edit account
      </button>
      {open ? (
        <EditClientAccountModal
          buyer={buyer}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            window.location.reload();
          }}
        />
      ) : null}
    </>
  );
}
