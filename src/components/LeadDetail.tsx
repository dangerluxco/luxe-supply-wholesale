"use client";

import { useEffect, useState, useTransition } from "react";
import { money, fullDate } from "@/lib/format";
import type { Lead, LeadActivity, LeadActivityType, LeadStatus } from "@/lib/firestore/leads";

const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualifying", "won", "lost"];
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualifying: "Qualifying",
  won: "Won",
  lost: "Lost",
};
const ACTIVITY_TYPES: { value: LeadActivityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
];
const ACTIVITY_ICON: Record<string, string> = {
  note: "📝",
  call: "📞",
  meeting: "📅",
  email: "✉️",
  status_change: "🔄",
  created: "✨",
  converted: "🎉",
};

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

export function LeadDetail({
  initialLead,
  initialActivities,
  currentStaffEmail,
}: {
  initialLead: Lead;
  initialActivities: LeadActivity[];
  currentStaffEmail: string;
}) {
  const [lead, setLead] = useState(initialLead);
  const [activities, setActivities] = useState(initialActivities);
  const [staffOptions, setStaffOptions] = useState<{ email: string; displayName: string }[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [company, setCompany] = useState(lead.company);
  const [contactName, setContactName] = useState(lead.contactName);
  const [email, setEmail] = useState(lead.email);
  const [phone, setPhone] = useState(lead.phone);
  const [industry, setIndustry] = useState(lead.industry);
  const [estAnnualSpend, setEstAnnualSpend] = useState(
    lead.estAnnualSpend != null ? String(lead.estAnnualSpend) : "",
  );
  const [notes, setNotes] = useState(lead.notes);

  const [activityType, setActivityType] = useState<LeadActivityType>("note");
  const [activityText, setActivityText] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertResult, setConvertResult] = useState<{ username: string; temporaryPassword: string } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => setStaffOptions(Array.isArray(data.staff) ? data.staff : []))
      .catch(() => {});
  }, []);

  function patch(body: Record<string, unknown>, onOk?: (lead: Lead) => void) {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/leads/${lead.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; lead?: Lead };
      if (!res.ok || data.error || !data.lead) {
        setError(data.error || "Could not update lead.");
        return;
      }
      setLead(data.lead);
      onOk?.(data.lead);
    });
  }

  function saveFields() {
    patch(
      {
        company,
        contactName,
        email,
        phone,
        industry,
        estAnnualSpend: estAnnualSpend || null,
        notes,
      },
      () => setMessage("Saved."),
    );
  }

  function changeStatus(status: LeadStatus) {
    patch({ status });
  }

  function changeAssignment(repEmail: string) {
    const rep = staffOptions.find((s) => s.email === repEmail);
    patch({ assignedRepEmail: repEmail || null, assignedRepName: rep?.displayName || null });
  }

  function addActivity() {
    if (!activityText.trim()) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/leads/${lead.id}/activity`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activityType, text: activityText }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; activity?: LeadActivity };
      if (!res.ok || data.error || !data.activity) {
        setError(data.error || "Could not add activity.");
        return;
      }
      setActivities((prev) => [data.activity as LeadActivity, ...prev]);
      setActivityText("");
    });
  }

  function convertToClient() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/leads/${lead.id}/convert`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        lead?: Lead;
        buyer?: { username: string };
        temporaryPassword?: string;
      };
      if (!res.ok || data.error || !data.lead || !data.buyer) {
        setError(data.error || "Could not convert lead.");
        return;
      }
      setLead(data.lead);
      setConvertResult({ username: data.buyer.username, temporaryPassword: data.temporaryPassword || "" });
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold text-ink">{lead.company}</h1>
          <span className="text-[12px] text-muted">
            {lead.contactName || "No contact name"} · created {fullDate(lead.createdAt)}
          </span>
        </div>
        <div className="min-w-[180px] rounded-card border border-border bg-surface px-4 py-3">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">STATUS</div>
          <select
            value={lead.status}
            onChange={(e) => changeStatus(e.target.value as LeadStatus)}
            disabled={pending}
            className={fieldClass}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] rounded-card border border-border bg-surface px-4 py-3">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">ASSIGNED REP</div>
          <select
            value={lead.assignedRepEmail || ""}
            onChange={(e) => changeAssignment(e.target.value)}
            disabled={pending}
            className={fieldClass}
          >
            <option value="">Unassigned</option>
            {staffOptions.map((s) => (
              <option key={s.email} value={s.email}>
                {s.displayName}
                {s.email === currentStaffEmail ? " (me)" : ""}
              </option>
            ))}
          </select>
          {lead.routingReason ? (
            <p className="mt-1.5 text-[10.5px] text-muted">{lead.routingReason}</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-[12px] text-danger">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">LEAD DETAILS</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>COMPANY</span>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>CONTACT NAME</span>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>EMAIL</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>PHONE</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>INDUSTRY</span>
                <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>EST. ANNUAL SPEND</span>
                <input
                  type="number"
                  min={0}
                  value={estAnnualSpend}
                  onChange={(e) => setEstAnnualSpend(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className={labelClass}>NOTES</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-chip border border-border bg-ground px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
              />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={saveFields}
                className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
              {message ? <span className="text-[11.5px] text-[#4E9A6A]">{message}</span> : null}
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">ACTIVITY TIMELINE</div>
            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as LeadActivityType)}
                className="h-9 rounded-chip border border-border bg-ground px-2.5 text-[12px] text-ink outline-none focus:border-accent"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addActivity();
                }}
                placeholder="Log a note, call summary, or meeting outcome…"
                className="h-9 min-w-[200px] flex-1 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={pending || !activityText.trim()}
                onClick={addActivity}
                className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {activities.length === 0 ? (
              <p className="text-[12px] text-muted">No activity logged yet.</p>
            ) : (
              <div className="space-y-3">
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 border-b border-border/60 pb-3 last:border-b-0">
                    <span className="shrink-0 text-[14px]">{ACTIVITY_ICON[a.type] || "•"}</span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-ink">{a.text}</p>
                      <p className="text-[10.5px] text-muted">
                        {a.staffName || a.staffEmail} · {fullDate(a.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">CONVERT TO CLIENT</div>
            {lead.convertedBuyerUsername ? (
              <p className="text-[12.5px] text-secondary">
                Converted to client account{" "}
                <span className="font-mono text-ink">@{lead.convertedBuyerUsername}</span>.
              </p>
            ) : convertResult ? (
              <div className="space-y-1.5 text-[12.5px]">
                <p className="text-secondary">
                  Client account created:{" "}
                  <span className="font-mono text-ink">@{convertResult.username}</span>
                </p>
                {convertResult.temporaryPassword ? (
                  <p className="text-secondary">
                    Temporary password:{" "}
                    <span className="font-mono text-ink">{convertResult.temporaryPassword}</span>
                  </p>
                ) : null}
                <p className="text-[11px] text-muted">Share these credentials with the client directly.</p>
              </div>
            ) : convertOpen ? (
              <div className="space-y-2">
                <p className="text-[12px] text-secondary">
                  Creates a wholesale buyer account for{" "}
                  <span className="font-semibold text-ink">{lead.email || "this lead"}</span> and marks the
                  lead Won.
                </p>
                {!lead.email ? (
                  <p className="text-[12px] text-danger">
                    Add a contact email above and save before converting.
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending || !lead.email}
                    onClick={convertToClient}
                    className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-50"
                  >
                    {pending ? "Converting…" : "Confirm convert"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConvertOpen(false)}
                    className="text-[11px] text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-secondary">
                  Once this lead is ready to buy, convert it into a wholesale buyer account.
                </p>
                <button
                  type="button"
                  onClick={() => setConvertOpen(true)}
                  className="h-9 rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-accent hover:text-ink"
                >
                  Convert to client
                </button>
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">SUMMARY</div>
            <div className="space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted">Est. annual spend</span>
                <span className="font-mono text-ink">
                  {lead.estAnnualSpend != null ? money(Math.round(lead.estAnnualSpend)) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Created by</span>
                <span className="text-ink">{lead.createdByName || lead.createdByEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Last updated</span>
                <span className="text-ink">{fullDate(lead.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
