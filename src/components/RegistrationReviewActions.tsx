"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Approve/reject via fetch API — no `"use server"` (soft-nav safe). */
export function RegistrationReviewActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    username: string;
    temporaryPassword: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  function onApprove() {
    setError(null);
    setAction("approve");
    startTransition(async () => {
      const res = await fetch(
        `/api/staff/applications/${encodeURIComponent(applicationId)}/approve`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNote: note }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        username?: string;
        temporaryPassword?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not approve.");
        return;
      }
      if (data.username && data.temporaryPassword) {
        setCredentials({
          username: data.username,
          temporaryPassword: data.temporaryPassword,
        });
        // Stay on page so staff can copy credentials; password is also on the
        // application record after reload.
        return;
      }
      router.refresh();
    });
  }

  function onReject() {
    setError(null);
    setAction("reject");
    startTransition(async () => {
      const res = await fetch(
        `/api/staff/applications/${encodeURIComponent(applicationId)}/reject`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNote: note }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not reject.");
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
        <div className="space-y-2 rounded-chip border border-border bg-ground px-3 py-3 text-[12px] text-[#4E9A6A]">
          <p>
            Approved. Username <span className="font-mono text-ink">@{credentials.username}</span> ·
            Temp password{" "}
            <span className="font-mono text-ink">{credentials.temporaryPassword}</span>
          </p>
          <p className="text-secondary">
            Login details were emailed to the buyer when SendGrid succeeded. Copy above if they
            need them again — or use Generate new password on their client page.
          </p>
          <a
            href={`/wholesaleportal/rep/applications/${applicationId}`}
            className="inline-block text-[11px] uppercase tracking-[0.1em] text-muted hover:text-ink"
          >
            Refresh application →
          </a>
        </div>
      ) : null}

      {!credentials ? (
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          aria-busy={action === "approve" || undefined}
          onClick={onApprove}
          className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {action === "approve" ? "Working…" : "Approve & create login"}
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={action === "reject" || undefined}
          onClick={onReject}
          className="h-10 rounded-chip border border-danger/40 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-danger disabled:opacity-60"
        >
          {action === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      ) : null}
    </div>
  );
}
