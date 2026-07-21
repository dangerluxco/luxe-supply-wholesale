"use client";

import { useState, useTransition } from "react";
import type { Lead } from "@/lib/leads-shared";

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

export function CreateLeadModal({
  currentStaffEmail,
  staffOptions,
  onClose,
  onCreated,
}: {
  currentStaffEmail: string;
  staffOptions: { email: string; displayName: string }[];
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [estAnnualSpend, setEstAnnualSpend] = useState("");
  const [assignedRepEmail, setAssignedRepEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!company.trim()) {
      setError("Company name is required.");
      return;
    }
    setError(null);
    const rep = staffOptions.find((s) => s.email === assignedRepEmail);
    start(async () => {
      const res = await fetch("/api/staff/leads", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          contactName,
          email,
          phone,
          industry,
          estAnnualSpend: estAnnualSpend || null,
          assignedRepEmail: assignedRepEmail || null,
          assignedRepName: rep?.displayName || null,
          notes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; lead?: Lead };
      if (!res.ok || data.error || !data.lead) {
        setError(data.error || "Could not create lead.");
        return;
      }
      onCreated(data.lead);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-full overflow-hidden rounded-card border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[16px] font-semibold text-ink">Create lead</h2>
          <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>COMPANY *</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} className={fieldClass} autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>CONTACT NAME</span>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>INDUSTRY</span>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>EMAIL</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>PHONE</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>EST. ANNUAL SPEND</span>
              <div className="flex items-center gap-1">
                <span className="text-muted">$</span>
                <input
                  type="number"
                  min={0}
                  value={estAnnualSpend}
                  onChange={(e) => setEstAnnualSpend(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>ASSIGN TO</span>
              <select
                value={assignedRepEmail}
                onChange={(e) => setAssignedRepEmail(e.target.value)}
                className={fieldClass}
              >
                <option value="">Auto-route by spend tier</option>
                {staffOptions.map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.displayName}
                    {s.email === currentStaffEmail ? " (me)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>NOTES</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
            />
          </label>
          {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className="text-[11px] text-muted hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="h-10 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
