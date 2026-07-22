"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money, fullDate } from "@/lib/format";
import type { InvoicePayment } from "@/lib/firestore/invoices";

const METHODS = ["wire", "check", "card", "cash", "other"] as const;

/**
 * Staff invoice payments: history of recorded payments, outstanding balance,
 * and a form to record a (possibly partial) payment. Fully-paid invoices flip
 * to PAID automatically server-side.
 */
export function InvoicePaymentsPanel({
  invoiceId,
  total,
  amountPaid,
  balance,
  payments,
  paid,
}: {
  invoiceId: string;
  total: number;
  amountPaid: number;
  balance: number;
  payments: InvoicePayment[];
  paid: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("wire");
  const [reference, setReference] = useState("");

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 micro-badge text-[10px] tracking-[0.14em] text-accent">PAYMENTS</div>

      <div className="mb-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="micro-badge text-[9px] tracking-[0.12em] text-muted">Total</div>
          <div className="font-mono text-[15px] font-semibold text-ink">{money(total)}</div>
        </div>
        <div>
          <div className="micro-badge text-[9px] tracking-[0.12em] text-muted">Received</div>
          <div className="font-mono text-[15px] font-semibold text-ink">{money(amountPaid)}</div>
        </div>
        <div>
          <div className="micro-badge text-[9px] tracking-[0.12em] text-muted">Balance</div>
          <div
            className={`font-mono text-[15px] font-semibold ${balance > 0 ? "text-danger" : "text-[#4E9A6A]"}`}
          >
            {money(balance)}
          </div>
        </div>
      </div>

      {payments.length > 0 ? (
        <div className="mb-3 space-y-1.5 border-t border-border pt-3">
          {payments.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="text-secondary">
                {fullDate(p.receivedAt)} · {p.method}
                {p.reference ? ` · ${p.reference}` : ""}
              </span>
              <span className="font-mono font-semibold text-ink">{money(p.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!paid ? (
        <div className="border-t border-border pt-3">
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (bal ${money(balance)})`}
              className="h-9 rounded-chip border border-border bg-ground px-3 font-mono text-[12px] text-ink outline-none focus:border-accent"
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-9 rounded-chip border border-border bg-ground px-2 text-[12px] text-ink outline-none focus:border-accent"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Reference (wire confirmation, check #…) — optional"
            className="mt-2 h-9 w-full rounded-chip border border-border bg-ground px-3 text-[12px] text-ink outline-none focus:border-accent"
          />
          {error ? <div className="mt-2 text-[11.5px] text-danger">{error}</div> : null}
          <button
            type="button"
            disabled={pending || !amount.trim()}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await fetch(`/api/staff/invoices/${invoiceId}/payments`, {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ amount: Number(amount), method, reference }),
                });
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok || data.error) {
                  setError(data.error || "Could not record payment.");
                  return;
                }
                setAmount("");
                setReference("");
                router.refresh();
              });
            }}
            className="mt-2 h-9 w-full rounded-chip bg-ink text-[11px] font-semibold uppercase tracking-[0.14em] text-ground transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Recording…" : "Record payment"}
          </button>
        </div>
      ) : (
        <div className="border-t border-border pt-3 text-[12px] text-[#4E9A6A]">Paid in full.</div>
      )}
    </div>
  );
}
