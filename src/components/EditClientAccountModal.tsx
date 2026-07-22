"use client";

import { useState, useTransition } from "react";
import type { PortalBuyer } from "@/lib/firestore/buyers";
import {
  PAYMENT_TERMS_OPTIONS,
  PAYMENT_TIERS,
  PREFERRED_PAYMENT_OPTIONS,
  SHIPPING_OPTIONS,
} from "@/lib/constants";

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";

export function EditClientAccountModal({
  buyer,
  onClose,
  onSaved,
}: {
  buyer: PortalBuyer;
  onClose: () => void;
  onSaved: (buyer: PortalBuyer) => void;
}) {
  const [city, setCity] = useState(buyer.city);
  const [state, setState] = useState(buyer.state);
  const [paymentTier, setPaymentTier] = useState(buyer.paymentTier);
  const [paymentTerms, setPaymentTerms] = useState(buyer.paymentTerms);
  const [preferredPayment, setPreferredPayment] = useState(buyer.preferredPayment);
  const [creditLimit, setCreditLimit] = useState(buyer.creditLimit != null ? String(buyer.creditLimit) : "");
  const [resaleCertVerified, setResaleCertVerified] = useState(buyer.resaleCertVerified);
  const [billTo, setBillTo] = useState(buyer.billTo);
  const [shippingAttn, setShippingAttn] = useState(buyer.shippingAttn);
  const [shippingLine1, setShippingLine1] = useState(buyer.shippingLine1);
  const [shippingLine2, setShippingLine2] = useState(buyer.shippingLine2);
  const [shippingCity, setShippingCity] = useState(buyer.shippingCity);
  const [shippingState, setShippingState] = useState(buyer.shippingState);
  const [shippingPostalCode, setShippingPostalCode] = useState(buyer.shippingPostalCode);
  const [shippingCountry, setShippingCountry] = useState(buyer.shippingCountry || "USA");
  const [shippingMethodId, setShippingMethodId] = useState(buyer.shippingMethodId);
  const [shippingSignatureRequired, setShippingSignatureRequired] = useState(buyer.shippingSignatureRequired);

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const trimmedLimit = creditLimit.trim();
    if (trimmedLimit && (!Number.isFinite(Number(trimmedLimit)) || Number(trimmedLimit) < 0)) {
      setError("Credit limit must be a positive number.");
      return;
    }
    start(async () => {
      const res = await fetch(`/api/staff/buyers/${encodeURIComponent(buyer.id)}/account`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          state,
          paymentTier,
          paymentTerms,
          preferredPayment,
          creditLimit: trimmedLimit ? Number(trimmedLimit) : null,
          resaleCertVerified,
          billTo,
          shippingAttn,
          shippingLine1,
          shippingLine2,
          shippingCity,
          shippingState,
          shippingPostalCode,
          shippingCountry,
          shippingMethodId,
          shippingSignatureRequired,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; buyer?: PortalBuyer };
      if (!res.ok || data.error || !data.buyer) {
        setError(data.error || "Could not save account details.");
        return;
      }
      onSaved(data.buyer);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-6 pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="w-[620px] max-w-full overflow-hidden rounded-card border border-border bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[16px] font-semibold text-ink">Edit account</h2>
          <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">LOCATION</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>CITY</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>STATE</span>
                <input value={state} onChange={(e) => setState(e.target.value)} className={fieldClass} />
              </label>
            </div>
          </div>

          <div>
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">BILLING &amp; CREDIT</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>PAYMENT TIER</span>
                <select
                  value={paymentTier}
                  onChange={(e) => {
                    const tier = Number(e.target.value);
                    setPaymentTier(tier);
                    // Picking a tier pre-fills its default terms — still editable below.
                    const preset = PAYMENT_TIERS.find((t) => t.tier === tier);
                    if (preset) setPaymentTerms(preset.defaultTerms);
                  }}
                  className={fieldClass}
                >
                  {PAYMENT_TIERS.map((t) => (
                    <option key={t.tier} value={t.tier}>
                      {t.label} ({t.defaultTerms})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>PAYMENT TERMS</span>
                <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={fieldClass}>
                  {PAYMENT_TERMS_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>PREFERRED PAYMENT</span>
                <select
                  value={preferredPayment}
                  onChange={(e) => setPreferredPayment(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Not set</option>
                  {PREFERRED_PAYMENT_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>CREDIT LIMIT ($)</span>
                <input
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="No limit set"
                  className={fieldClass}
                />
              </label>
              <label className="mt-6 flex items-center gap-2 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={resaleCertVerified}
                  onChange={(e) => setResaleCertVerified(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Resale certificate verified
              </label>
            </div>
          </div>

          <div>
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">
              BILL TO (INVOICES)
            </div>
            <textarea
              rows={3}
              value={billTo}
              onChange={(e) => setBillTo(e.target.value)}
              placeholder={"Leave blank to use company / contact name.\nOne line per invoice line, e.g.\nAcme Resale LLC\n123 Fifth Ave, Suite 4\nNew York, NY 10010"}
              className="w-full rounded-chip border border-border bg-ground px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">SHIPPING PROFILE</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className={labelClass}>ATTN / RECEIVING CONTACT</span>
                <input value={shippingAttn} onChange={(e) => setShippingAttn(e.target.value)} className={fieldClass} />
              </label>
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className={labelClass}>ADDRESS LINE 1</span>
                <input value={shippingLine1} onChange={(e) => setShippingLine1(e.target.value)} className={fieldClass} />
              </label>
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className={labelClass}>ADDRESS LINE 2</span>
                <input value={shippingLine2} onChange={(e) => setShippingLine2(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>CITY</span>
                <input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>STATE</span>
                <input value={shippingState} onChange={(e) => setShippingState(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>POSTAL CODE</span>
                <input
                  value={shippingPostalCode}
                  onChange={(e) => setShippingPostalCode(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>COUNTRY</span>
                <input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>DEFAULT SHIPPING METHOD</span>
                <select
                  value={shippingMethodId}
                  onChange={(e) => setShippingMethodId(e.target.value)}
                  className={fieldClass}
                >
                  {SHIPPING_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-6 flex items-center gap-2 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={shippingSignatureRequired}
                  onChange={(e) => setShippingSignatureRequired(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Signature required on delivery
              </label>
            </div>
          </div>

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
            {pending ? "Saving…" : "Save account"}
          </button>
        </div>
      </div>
    </div>
  );
}
