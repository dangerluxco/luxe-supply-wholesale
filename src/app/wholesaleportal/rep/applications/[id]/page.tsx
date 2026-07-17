import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getRegistrationRequestById } from "@/lib/firestore/registrationRequests";
import { RegistrationReviewActions } from "@/components/RegistrationReviewActions";

export const dynamic = "force-dynamic";

function DocLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <div className="rounded-chip border border-border bg-ground px-3 py-2 text-[12px] text-muted">
        {label}: not provided
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-chip border border-border bg-ground px-3 py-2 text-[12px] text-accent underline"
    >
      {label} — open
    </a>
  );
}

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }

  const { id } = await params;
  const app = await getRegistrationRequestById(id);
  if (!app) notFound();

  return (
    <div className="px-8 pb-16 pt-8">
      <Link
        href="/wholesaleportal/rep/applications"
        className="text-[12px] text-secondary underline"
      >
        ← Registration requests
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-ink">
            {app.firstName} {app.lastName}
          </h1>
          <p className="mt-1 text-[13px] text-secondary">
            {app.email}
            {app.company ? ` · ${app.company}` : ""}
          </p>
        </div>
        <span className="rounded-chip border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink">
          {app.status}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="micro-badge text-[10px] tracking-[0.14em] text-muted">CONTACT & TAX</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Phone</dt>
              <dd className="text-ink">{app.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Business Tax ID</dt>
              <dd className="font-mono text-ink">{app.businessTaxId || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Submitted</dt>
              <dd className="font-mono text-[12px] text-ink">
                {app.createdAt ? new Date(app.createdAt).toLocaleString() : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="micro-badge text-[10px] tracking-[0.14em] text-muted">MAILING ADDRESS</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ink">
            {app.addressLine1}
            {app.addressLine2 ? (
              <>
                <br />
                {app.addressLine2}
              </>
            ) : null}
            <br />
            {app.city}, {app.state} {app.postalCode}
            <br />
            {app.country}
          </p>
        </section>
      </div>

      <section className="mt-6 rounded-card border border-border bg-surface p-5">
        <h2 className="micro-badge text-[10px] tracking-[0.14em] text-muted">DOCUMENTS</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DocLink href={app.documents.idFrontUrl} label="Government ID — front" />
          <DocLink href={app.documents.idBackUrl} label="Government ID — back" />
          <DocLink
            href={app.documents.businessRegistrationUrl}
            label="Business registration"
          />
          <DocLink href={app.documents.resaleCertificateUrl} label="Resale certificate" />
        </div>
      </section>

      {app.status === "pending" ? (
        <RegistrationReviewActions applicationId={app.id} />
      ) : (
        <div className="mt-6 rounded-card border border-border bg-surface p-5 text-[13px] text-secondary">
          <p>
            Reviewed by <span className="text-ink">{app.reviewedBy || "—"}</span>
            {app.reviewedAt
              ? ` on ${new Date(app.reviewedAt).toLocaleString()}`
              : ""}
            .
          </p>
          {app.reviewNote ? <p className="mt-2 text-ink">{app.reviewNote}</p> : null}
          {app.status === "approved" && app.temporaryPassword ? (
            <div className="mt-2 space-y-1 text-[#4E9A6A]">
              <p>
                Buyer login created
                {app.buyerId ? ` (id ${app.buyerId})` : ""}.
              </p>
              <p>
                Temporary password{" "}
                <span className="font-mono text-ink">{app.temporaryPassword}</span>
                {" — "}also emailed to the buyer when SendGrid is configured.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
