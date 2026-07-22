"use client";

import { useState, useTransition } from "react";
import type {
  CompanyProfile,
  InvoicingProfile,
  PortalFeatures,
  QuoteThresholds,
} from "@/lib/firestore/settings";

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";
const areaClass =
  "w-full rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent";

function useSaveMessage() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return { pending, start, error, setError, message, setMessage };
}

async function postSettings(body: Record<string, unknown>) {
  const res = await fetch("/api/staff/settings", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok || data.error) throw new Error(data.error || "Could not save settings.");
  return data.message || "Settings saved.";
}

export function GeneralSettingsForm({ initial }: { initial: CompanyProfile }) {
  const { pending, start, error, setError, message, setMessage } = useSaveMessage();
  const [form, setForm] = useState(initial);

  return (
    <form
      className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            setMessage(await postSettings({ section: "general", companyProfile: form }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>COMPANY DISPLAY NAME</span>
        <input
          className={fieldClass}
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>TIMEZONE</span>
        <input
          className={fieldClass}
          value={form.timezone}
          onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          placeholder="America/New_York"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>LOGO URL</span>
        <input
          className={fieldClass}
          value={form.logoUrl}
          onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
          placeholder="https://…"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>BRAND COLOR</span>
        <input
          className={fieldClass}
          value={form.brandColor}
          onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))}
          placeholder="#B08D3E"
        />
      </label>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save general"}
      </button>
    </form>
  );
}

export function InvoicingSettingsForm({ initial }: { initial: InvoicingProfile }) {
  const { pending, start, error, setError, message, setMessage } = useSaveMessage();
  const [form, setForm] = useState(initial);
  const set = (key: keyof InvoicingProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="max-w-2xl space-y-5 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            setMessage(await postSettings({ section: "invoicing", invoicing: form }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
          }
        });
      }}
    >
      <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">LETTERHEAD</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className={labelClass}>LEGAL NAME</span>
          <input className={fieldClass} value={form.legalName} onChange={set("legalName")} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className={labelClass}>ADDRESS LINE 1</span>
          <input className={fieldClass} value={form.addressLine1} onChange={set("addressLine1")} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className={labelClass}>ADDRESS LINE 2</span>
          <input className={fieldClass} value={form.addressLine2} onChange={set("addressLine2")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>CITY</span>
          <input className={fieldClass} value={form.city} onChange={set("city")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>STATE</span>
          <input className={fieldClass} value={form.state} onChange={set("state")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>POSTAL CODE</span>
          <input className={fieldClass} value={form.postalCode} onChange={set("postalCode")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>COUNTRY</span>
          <input className={fieldClass} value={form.country} onChange={set("country")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>TAX / EIN</span>
          <input className={fieldClass} value={form.taxId} onChange={set("taxId")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>INVOICE PREFIX</span>
          <input className={fieldClass} value={form.invoicePrefix} onChange={set("invoicePrefix")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>DEFAULT TERMS</span>
          <input className={fieldClass} value={form.defaultTerms} onChange={set("defaultTerms")} />
        </label>
      </div>

      <div className="border-t border-border pt-5">
        <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">BANK / WIRE</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>BANK NAME</span>
            <input className={fieldClass} value={form.bankName} onChange={set("bankName")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ACCOUNT NAME</span>
            <input className={fieldClass} value={form.accountName} onChange={set("accountName")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ACCOUNT #</span>
            <input className={fieldClass} value={form.accountNumber} onChange={set("accountNumber")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ROUTING / ABA</span>
            <input className={fieldClass} value={form.routingAba} onChange={set("routingAba")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>SWIFT</span>
            <input className={fieldClass} value={form.swift} onChange={set("swift")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>REMITTANCE EMAIL</span>
            <input className={fieldClass} value={form.remittanceEmail} onChange={set("remittanceEmail")} />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>LEGACY FREEFORM INSTRUCTIONS (FALLBACK)</span>
        <textarea
          rows={4}
          className={areaClass}
          value={form.paymentInstructions}
          onChange={set("paymentInstructions")}
        />
      </label>

      <div className="border-t border-border pt-5">
        <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">
          AFTER THE INVOICE
        </div>
        <p className="mb-3 text-[12.5px] text-secondary">
          Printed below the payment block on every PDF — notes, terms of sale, and a closing line.
          Leave notes or terms blank to omit that section.
        </p>
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>INVOICE NOTES</span>
            <textarea
              rows={3}
              className={areaClass}
              value={form.invoiceNotes}
              onChange={set("invoiceNotes")}
              placeholder="e.g. Please include the invoice number on your wire remittance…"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>TERMS &amp; CONDITIONS</span>
            <textarea
              rows={6}
              className={areaClass}
              value={form.termsAndConditions}
              onChange={set("termsAndConditions")}
              placeholder="e.g. All sales final. Title passes on receipt of cleared funds. Returns only for authenticity issues…"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>FOOTER / THANK-YOU</span>
            <textarea
              rows={2}
              className={areaClass}
              value={form.footerMessage}
              onChange={set("footerMessage")}
              placeholder="Every piece is one of one, authenticated, and insured in transit…"
            />
          </label>
        </div>
      </div>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save invoicing"}
      </button>
    </form>
  );
}

export function ThresholdsSettingsForm({ initial }: { initial: QuoteThresholds }) {
  const { pending, start, error, setError, message, setMessage } = useSaveMessage();

  return (
    <form
      className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            setMessage(
              await postSettings({
                section: "thresholds",
                minItemCount: Number(fd.get("minItemCount") || 0),
                minCartTotal: Number(fd.get("minCartTotal") || 0),
              }),
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
          }
        });
      }}
    >
      <p className="text-[12.5px] text-secondary">
        Buyers must meet at least one active rule to submit. Set a value to 0 to turn that rule off.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MIN ITEM COUNT</span>
          <input
            name="minItemCount"
            type="number"
            min={0}
            defaultValue={initial.minItemCount}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>MIN ORDER TOTAL ($)</span>
          <input
            name="minCartTotal"
            type="number"
            min={0}
            defaultValue={initial.minCartTotal}
            className={fieldClass}
          />
        </label>
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}

export function FeaturesSettingsForm({ initial }: { initial: PortalFeatures }) {
  const { pending, start, error, setError, message, setMessage } = useSaveMessage();
  const [form, setForm] = useState(initial);
  const toggle = (key: keyof PortalFeatures) =>
    setForm((f) => ({ ...f, [key]: !f[key] }));

  return (
    <form
      className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            setMessage(await postSettings({ section: "features", features: form }));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
          }
        });
      }}
    >
      <p className="text-[12.5px] text-secondary">
        Hide modules from the staff nav (and soft-gate their APIs). Data is kept when toggled off.
      </p>
      {(
        [
          ["leads", "Leads pipeline"],
          ["wishlist", "Wishlist"],
          ["performance", "Performance dashboard"],
          ["curation", "Curate Order"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex cursor-pointer items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
          <span className="text-[13px] text-ink">{label}</span>
          <input
            type="checkbox"
            checked={form[key]}
            onChange={() => toggle(key)}
            className="h-4 w-4 accent-accent"
          />
        </label>
      ))}
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save features"}
      </button>
    </form>
  );
}

export function NotificationsSettingsForm({ initialEmails }: { initialEmails: string[] }) {
  const { pending, start, error, setError, message, setMessage } = useSaveMessage();

  return (
    <form
      className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            setMessage(
              await postSettings({
                section: "notifications",
                notifyEmails: String(fd.get("notifyEmails") || ""),
              }),
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed.");
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>ADDITIONAL NOTIFICATION EMAILS (COMMA-SEPARATED)</span>
        <textarea
          name="notifyEmails"
          rows={3}
          defaultValue={initialEmails.join(", ")}
          className={areaClass}
          placeholder="ops@luxesupply.com, manager@luxesupply.com"
        />
      </label>
      <p className="text-[11px] text-muted">
        Active staff accounts are always notified on new order requests. Extra recipients need{" "}
        <code className="font-mono">RESEND_API_KEY</code>.
      </p>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12px] text-[#4E9A6A]">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save notifications"}
      </button>
    </form>
  );
}
