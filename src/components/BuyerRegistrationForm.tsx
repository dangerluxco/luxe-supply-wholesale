"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitBuyerRegistration } from "@/lib/actions/registration";

const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent";
const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";
const fileClass =
  "block w-full rounded-chip border border-dashed border-border bg-ground px-3 py-3 text-[12px] text-secondary file:mr-3 file:rounded-chip file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:uppercase file:tracking-[0.12em] file:text-ground";

export function BuyerRegistrationForm({ initialCode = "" }: { initialCode?: string }) {
  const [state, action, pending] = useActionState(submitBuyerRegistration, {} as {
    error?: string;
    ok?: boolean;
    message?: string;
  });

  if (state?.ok) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">RECEIVED</div>
        <h1 className="mt-3 text-[22px] font-semibold text-ink">Application submitted</h1>
        <p className="mx-auto mt-3 max-w-md text-[13px] text-secondary">{state.message}</p>
        <Link
          href="/wholesale/sign-in"
          className="mt-6 inline-flex h-10 items-center rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} encType="multipart/form-data" className="space-y-8">
      <div>
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">WHOLESALE ACCESS</div>
        <h1 className="mt-2 text-[24px] font-semibold text-ink">Request to join</h1>
        <p className="mt-2 max-w-2xl text-[13px] text-secondary">
          Submit your invite code, business details, and verification documents. Our team reviews
          each application before creating a storefront login.
        </p>
      </div>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Invite code
        </h2>
        <label className="mt-4 flex max-w-md flex-col gap-1.5">
          <span className={labelClass}>CODE *</span>
          <input
            name="inviteCode"
            required
            defaultValue={initialCode}
            autoComplete="off"
            className={`${fieldClass} font-mono uppercase tracking-[0.12em]`}
            placeholder="XXXX-XXXX"
          />
        </label>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Contact
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>FIRST NAME *</span>
            <input name="firstName" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>LAST NAME *</span>
            <input name="lastName" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>EMAIL *</span>
            <input name="email" type="email" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>PHONE *</span>
            <input name="phone" type="tel" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>COMPANY / DBA</span>
            <input name="company" className={fieldClass} />
          </label>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Mailing address
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>ADDRESS LINE 1 *</span>
            <input name="addressLine1" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>ADDRESS LINE 2</span>
            <input name="addressLine2" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>CITY *</span>
            <input name="city" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>STATE *</span>
            <input name="state" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>POSTAL CODE *</span>
            <input name="postalCode" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>COUNTRY</span>
            <input name="country" defaultValue="US" className={fieldClass} />
          </label>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Business tax ID
        </h2>
        <label className="mt-4 flex max-w-md flex-col gap-1.5">
          <span className={labelClass}>EIN / BUSINESS TAX ID *</span>
          <input name="businessTaxId" required className={fieldClass} />
        </label>
      </section>

      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          Verification documents
        </h2>
        <p className="mt-2 text-[12px] text-secondary">
          Images or PDF, max 8MB each. Government ID must be clear front and back photos.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>GOVERNMENT ID — FRONT *</span>
            <input name="idFront" type="file" accept="image/*" required className={fileClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>GOVERNMENT ID — BACK *</span>
            <input name="idBack" type="file" accept="image/*" required className={fileClass} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>BUSINESS REGISTRATION DOCUMENT *</span>
            <input
              name="businessRegistration"
              type="file"
              accept="image/*,application/pdf"
              required
              className={fileClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>STATE RESALE CERTIFICATE (OPTIONAL)</span>
            <input
              name="resaleCertificate"
              type="file"
              accept="image/*,application/pdf"
              className={fileClass}
            />
          </label>
        </div>
      </section>

      {state?.error ? <p className="text-[13px] text-danger">{state.error}</p> : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="h-11 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit application"}
        </button>
        <Link href="/wholesale/sign-in" className="text-[12.5px] text-secondary underline">
          Already have access? Sign in
        </Link>
      </div>
    </form>
  );
}
