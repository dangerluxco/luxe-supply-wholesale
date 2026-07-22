"use client";

import { useState, useTransition } from "react";

const fieldClass =
  "h-10 rounded-chip border border-border bg-ground px-3 font-mono text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

/** Settings via fetch API — no `"use server"` (soft-nav safe). */
export function ThresholdSettingsForm({
  minItemCount,
  minCartTotal,
  notifyEmails,
  paymentInstructions = "",
}: {
  minItemCount: number;
  minCartTotal: number;
  notifyEmails: string[];
  paymentInstructions?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="max-w-2xl space-y-5 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setMessage(null);
        start(async () => {
          const res = await fetch("/api/staff/settings", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              minItemCount: Number(fd.get("minItemCount") || 0),
              minCartTotal: Number(fd.get("minCartTotal") || 0),
              notifyEmails: String(fd.get("notifyEmails") || ""),
              paymentInstructions: String(fd.get("paymentInstructions") || ""),
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (!res.ok || data.error) {
            setError(data.error || "Could not save settings.");
            return;
          }
          setMessage(data.message || "Settings saved.");
        });
      }}
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
        ORDER REQUEST THRESHOLDS
      </div>
      <p className="text-[12.5px] text-secondary">
        Buyers must meet at least one active rule to submit their order for processing to
        invoice. Set a value to 0 to turn that rule off.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MIN ITEM COUNT</span>
          <input
            name="minItemCount"
            type="number"
            min={0}
            step={1}
            defaultValue={minItemCount}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MIN ORDER TOTAL ($)</span>
          <input
            name="minCartTotal"
            type="number"
            min={0}
            step={1}
            defaultValue={minCartTotal}
            className={fieldClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ADDITIONAL NOTIFICATION EMAILS (COMMA-SEPARATED)</span>
        <textarea
          name="notifyEmails"
          rows={2}
          defaultValue={notifyEmails.join(", ")}
          placeholder="ops@luxesupply.com, manager@luxesupply.com"
          className="rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
        />
      </label>
      <p className="text-[11px] text-muted">
        Active staff accounts are always notified when a buyer submits an order request. Add
        extra recipients here if needed. Sending requires{" "}
        <code className="font-mono">RESEND_API_KEY</code> to be configured on the server.
      </p>

      <div className="border-t border-border pt-5">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
          INVOICE PDF · WIRE INSTRUCTIONS
        </div>
        <p className="mt-2 text-[12.5px] text-secondary">
          Printed in the payment block of every downloaded invoice PDF — bank name, account,
          routing/ABA, SWIFT, remittance contact. The invoice number is appended automatically
          as the wire reference.
        </p>
        <label className="mt-3 flex flex-col gap-1.5">
          <span className={labelClass}>WIRE / PAYMENT INSTRUCTIONS</span>
          <textarea
            name="paymentInstructions"
            rows={6}
            defaultValue={paymentInstructions}
            placeholder={
              "Bank: …\nAccount name: Luxe Supply Corporation\nAccount #: …\nRouting / ABA: …\nSWIFT: …"
            }
            className="rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
          />
        </label>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
