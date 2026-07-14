"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveBuyerRegistration,
  rejectBuyerRegistration,
} from "@/lib/actions/registration";

export function RegistrationReviewActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    username: string;
    temporaryPassword: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveBuyerRegistration(applicationId, note);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.username && res.temporaryPassword) {
        setCredentials({
          username: res.username,
          temporaryPassword: res.temporaryPassword,
        });
      }
      router.refresh();
    });
  }

  function onReject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectBuyerRegistration(applicationId, note);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-3 rounded-card border border-border bg-surface p-5">
      <label className="flex flex-col gap-1.5">
        <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
          REVIEW NOTE (OPTIONAL)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded-chip border border-border bg-ground px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent"
          placeholder="Internal note for approve / reject…"
        />
      </label>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {credentials ? (
        <p className="text-[12px] text-[#4E9A6A]">
          Approved. Username <span className="font-mono">@{credentials.username}</span> · Temp
          password <span className="font-mono">{credentials.temporaryPassword}</span>
          {" — "}share these securely with the buyer.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onApprove}
          className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Working…" : "Approve & create login"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onReject}
          className="h-10 rounded-chip border border-danger/40 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
