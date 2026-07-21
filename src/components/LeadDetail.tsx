"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { money, fullDate, shortDate } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { PressableButton } from "@/components/PressableButton";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_TEST_STATUSES,
  LEAD_PROJECT_STATUSES,
  type Lead,
  type LeadActivity,
  type LeadActivityType,
  type LeadStatus,
  type LeadTest,
  type LeadTestStatus,
  type LeadProject,
  type LeadProjectStatus,
} from "@/lib/leads-shared";

const STATUS_COLOR: Record<LeadStatus, string> = {
  new: "#3A7CA5",
  contacted: "#B08D3E",
  qualifying: "#8A6FBF",
  won: "#4E9A6A",
  lost: "#A65440",
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

const TEST_STATUS_LABEL: Record<LeadTestStatus, string> = {
  available: "Available",
  scheduled: "Scheduled",
  passed: "Passed",
  failed: "Failed",
  waived: "Waived",
};

const PROJECT_STATUS_LABEL: Record<LeadProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  done: "Done",
  cancelled: "Cancelled",
};

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

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
  const [tests, setTests] = useState<LeadTest[]>(lead.testsAvailable);
  const [projects, setProjects] = useState<LeadProject[]>(lead.activeProjects);

  const [activityType, setActivityType] = useState<LeadActivityType>("note");
  const [activityText, setActivityText] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertResult, setConvertResult] = useState<{ username: string; temporaryPassword: string } | null>(
    null,
  );
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    fetch("/api/staff/directory", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => setStaffOptions(Array.isArray(data.staff) ? data.staff : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLead(initialLead);
    setTests(initialLead.testsAvailable);
    setProjects(initialLead.activeProjects);
  }, [initialLead]);

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
      setTests(data.lead.testsAvailable);
      setProjects(data.lead.activeProjects);
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

  function updateTest(id: string, next: Partial<LeadTest>) {
    const nextTests = tests.map((t) => (t.id === id ? { ...t, ...next } : t));
    setTests(nextTests);
    patch({ testsAvailable: nextTests });
  }

  function addProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const nextProjects: LeadProject[] = [
      {
        id: `project_${Math.random().toString(36).slice(2, 10)}`,
        name,
        status: "active",
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
      ...projects,
    ];
    setNewProjectName("");
    setProjects(nextProjects);
    patch({ activeProjects: nextProjects }, () => setMessage("Project added."));
  }

  function updateProject(id: string, next: Partial<LeadProject>) {
    const nextProjects = projects.map((p) =>
      p.id === id ? { ...p, ...next, updatedAt: new Date().toISOString() } : p,
    );
    setProjects(nextProjects);
    patch({ activeProjects: nextProjects });
  }

  function removeProject(id: string) {
    const nextProjects = projects.filter((p) => p.id !== id);
    setProjects(nextProjects);
    patch({ activeProjects: nextProjects });
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

  const activeProjectCount = projects.filter((p) => p.status === "active").length;
  const testsReady = tests.filter((t) => t.status === "passed" || t.status === "waived").length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold text-ink">{lead.company}</h1>
          <span className="text-[12px] text-muted">
            {lead.contactName || "No contact name"}
            {lead.industry ? ` · ${lead.industry}` : ""} · created {fullDate(lead.createdAt)}
          </span>
        </div>
        <div className="rounded-card border border-border bg-surface px-4 py-3">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">STATUS</div>
          <div className="flex flex-wrap gap-1">
            {LEAD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => changeStatus(s)}
                className={clsx(
                  "no-press rounded-chip px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition",
                  lead.status === s
                    ? "text-ground"
                    : "border border-border text-secondary hover:border-accent",
                )}
                style={lead.status === s ? { background: STATUS_COLOR[s] } : undefined}
              >
                {LEAD_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-[200px] rounded-card border border-border bg-surface px-4 py-3">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">OWNER</div>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Section title="Contact & company">
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
              <PressableButton
                pending={pending}
                pendingLabel="Saving…"
                onClick={saveFields}
                className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground"
              >
                Save changes
              </PressableButton>
              {message ? <span className="text-[11.5px] text-[#4E9A6A]">{message}</span> : null}
            </div>
          </Section>

          <Section
            title="Tests available"
            action={
              <span className="font-mono text-[10.5px] text-muted">
                {testsReady}/{tests.length} cleared
              </span>
            }
          >
            <p className="mb-3 text-[12px] text-secondary">
              Qualification checks for this account — mark status as you complete each step.
            </p>
            <div className="space-y-2">
              {tests.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-chip border border-border/70 bg-ground/40 px-3 py-2.5"
                >
                  <div className="min-w-[160px] flex-1 text-[12.5px] font-semibold text-ink">{t.label}</div>
                  <select
                    value={t.status}
                    disabled={pending}
                    onChange={(e) => updateTest(t.id, { status: e.target.value as LeadTestStatus })}
                    className="h-8 rounded-chip border border-border bg-surface px-2 text-[11.5px] text-ink outline-none focus:border-accent"
                  >
                    {LEAD_TEST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TEST_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={t.note}
                    disabled={pending}
                    onChange={(e) => {
                      const note = e.target.value;
                      setTests((prev) => prev.map((x) => (x.id === t.id ? { ...x, note } : x)));
                    }}
                    onBlur={(e) => updateTest(t.id, { note: e.target.value })}
                    placeholder="Note…"
                    className="h-8 min-w-[140px] flex-1 rounded-chip border border-border bg-surface px-2 text-[11.5px] text-ink outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Active projects"
            action={
              <span className="font-mono text-[10.5px] text-muted">{activeProjectCount} active</span>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addProject();
                }}
                placeholder="Add project (e.g. Sample order, Curation kickoff)…"
                className="h-9 min-w-[220px] flex-1 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent"
              />
              <PressableButton
                pending={pending}
                disabled={!newProjectName.trim()}
                onClick={addProject}
                className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-50"
              >
                Add
              </PressableButton>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-chip border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted">
                No active projects yet. Track open workstreams for this lead here.
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <div key={p.id} className="rounded-chip border border-border/70 bg-ground/40 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={p.name}
                        disabled={pending}
                        onChange={(e) => {
                          const name = e.target.value;
                          setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, name } : x)));
                        }}
                        onBlur={(e) => updateProject(p.id, { name: e.target.value })}
                        className="h-8 min-w-[160px] flex-1 rounded-chip border border-border bg-surface px-2 text-[12.5px] font-semibold text-ink outline-none focus:border-accent"
                      />
                      <select
                        value={p.status}
                        disabled={pending}
                        onChange={(e) =>
                          updateProject(p.id, { status: e.target.value as LeadProjectStatus })
                        }
                        className="h-8 rounded-chip border border-border bg-surface px-2 text-[11.5px] text-ink outline-none focus:border-accent"
                      >
                        {LEAD_PROJECT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {PROJECT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeProject(p.id)}
                        className="text-[11px] text-muted hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      value={p.notes}
                      disabled={pending}
                      onChange={(e) => {
                        const notesVal = e.target.value;
                        setProjects((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, notes: notesVal } : x)),
                        );
                      }}
                      onBlur={(e) => updateProject(p.id, { notes: e.target.value })}
                      placeholder="Project notes…"
                      className="mt-2 h-8 w-full rounded-chip border border-border bg-surface px-2 text-[11.5px] text-ink outline-none focus:border-accent"
                    />
                    <p className="mt-1.5 text-[10.5px] text-muted">
                      Updated {shortDate(p.updatedAt) || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Activity timeline">
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
              <PressableButton
                pending={pending}
                disabled={!activityText.trim()}
                onClick={addActivity}
                className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-50"
              >
                Add
              </PressableButton>
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
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Summary">
            <div className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Pipeline status</span>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_COLOR[lead.status] }}
                  />
                  {LEAD_STATUS_LABEL[lead.status]}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Est. annual spend</span>
                <span className="font-mono text-ink">
                  {lead.estAnnualSpend != null ? money(Math.round(lead.estAnnualSpend)) : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Owner</span>
                <span className="text-ink">{lead.assignedRepName || "Unassigned"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Tests cleared</span>
                <span className="font-mono text-ink">
                  {testsReady}/{tests.length}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Active projects</span>
                <span className="font-mono text-ink">{activeProjectCount}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Created by</span>
                <span className="text-ink">{lead.createdByName || lead.createdByEmail}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Last updated</span>
                <span className="text-ink">{fullDate(lead.updatedAt)}</span>
              </div>
            </div>
          </Section>

          <Section title="Convert to client">
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
                  <PressableButton
                    pending={pending}
                    pendingLabel="Converting…"
                    disabled={!lead.email}
                    onClick={convertToClient}
                    className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-50"
                  >
                    Confirm convert
                  </PressableButton>
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
                <PressableButton
                  onClick={() => setConvertOpen(true)}
                  className="h-9 rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-accent hover:text-ink"
                >
                  Convert to client
                </PressableButton>
              </div>
            )}
          </Section>

          <Section title="Quick facts">
            <div className="space-y-2 text-[12.5px]">
              <div>
                <div className={labelClass}>EMAIL</div>
                <div className="mt-0.5 text-ink">{lead.email || "—"}</div>
              </div>
              <div>
                <div className={labelClass}>PHONE</div>
                <div className="mt-0.5 text-ink">{lead.phone || "—"}</div>
              </div>
              <div>
                <div className={labelClass}>INDUSTRY</div>
                <div className="mt-0.5 text-ink">{lead.industry || "—"}</div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
