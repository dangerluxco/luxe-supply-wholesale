import Link from "next/link";
import { listBuyers } from "@/lib/firestore/buyers";
import {
  listRegistrationRequests,
  type RegistrationStatus,
} from "@/lib/firestore/registrationRequests";
import { EmptyState } from "@/components/EmptyState";
import { InviteBuyerForm } from "@/components/InviteBuyerForm";
import { TierBadge } from "@/components/badges";
import { clsx } from "@/lib/clsx";

export const dynamic = "force-dynamic";

function appStatusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "applications" ? "applications" : "clients";

  const [buyers, pendingApplications] = await Promise.all([
    listBuyers(),
    listRegistrationRequests("pending"),
  ]);

  const appStatusFilter =
    sp.status === "pending" || sp.status === "approved" || sp.status === "rejected"
      ? (sp.status as RegistrationStatus)
      : "all";

  const applications =
    tab === "applications" ? await listRegistrationRequests(appStatusFilter) : [];

  const tabClass = (active: boolean) =>
    clsx(
      "rounded-chip px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] transition",
      active ? "bg-ink text-ground" : "border border-border text-secondary hover:border-accent",
    );

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Clients</h1>
        <span className="text-[12px] text-muted">
          Firestore `salesPortalBuyers` &amp; registration applications
        </span>
        <div className="flex-1" />
        <a
          href="/api/staff/export/clients"
          className="pressable rounded-chip border border-border px-3 py-1.5 text-[11px] text-secondary hover:border-accent hover:text-ink"
        >
          Export CSV
        </a>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/wholesaleportal/rep/clients" className={tabClass(tab === "clients")}>
          Clients
        </Link>
        <Link
          href="/wholesaleportal/rep/clients?tab=applications"
          className={tabClass(tab === "applications")}
        >
          Applications
          {pendingApplications.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-ink">
              {pendingApplications.length}
            </span>
          ) : null}
        </Link>
      </div>

      {tab === "clients" ? (
        <>
          <InviteBuyerForm />

          {buyers.length === 0 ? (
            <EmptyState
              title="No clients yet."
              hint="Invite a buyer above — they'll be able to sign in on the storefront immediately."
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1fr_90px_100px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <span>Name</span>
                <span>Username</span>
                <span>Email</span>
                <span>Company</span>
                <span className="text-center">Tier</span>
                <span className="text-center">Status</span>
              </div>
              {buyers.map((b) => (
                <a
                  key={b.id}
                  href={`/wholesaleportal/rep/clients/${b.id}`}
                  className="grid grid-cols-[1.2fr_1fr_1.2fr_1fr_90px_100px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] transition last:border-b-0 hover:bg-ground"
                >
                  <span className="font-semibold text-ink hover:text-accent hover:underline">
                    {b.displayName || "—"}
                  </span>
                  <span className="font-mono text-[11px]">@{b.username}</span>
                  <span className="truncate">{b.email || "—"}</span>
                  <span>{b.company || "—"}</span>
                  <span className="flex justify-center">
                    <TierBadge tier={b.paymentTier} />
                  </span>
                  <span className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {b.status}
                  </span>
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-secondary">
            Review wholesale access applications — approve to create a buyer login, or reject.
          </p>

          <div className="mb-6 flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "All" },
                { id: "pending", label: "Pending" },
                { id: "approved", label: "Approved" },
                { id: "rejected", label: "Rejected" },
              ] as const
            ).map((t) => {
              const active = appStatusFilter === t.id;
              const href =
                t.id === "all"
                  ? "/wholesaleportal/rep/clients?tab=applications"
                  : `/wholesaleportal/rep/clients?tab=applications&status=${t.id}`;
              return (
                <a
                  key={t.id}
                  href={href}
                  className={clsx(
                    "rounded-chip px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                    active ? "bg-ink text-ground" : "border border-border text-secondary",
                  )}
                >
                  {t.label}
                </a>
              );
            })}
          </div>

          {applications.length === 0 ? (
            <EmptyState
              title="No registration requests."
              hint="Applicants submit from /wholesale/register on the storefront."
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="grid grid-cols-[1fr_1.2fr_120px_110px_100px] gap-x-4 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <span>Name</span>
                <span>Email / company</span>
                <span>Submitted</span>
                <span className="text-center">Status</span>
                <span />
              </div>
              {applications.map((row) => (
                <a
                  key={row.id}
                  href={`/wholesaleportal/rep/applications/${row.id}`}
                  className="grid grid-cols-[1fr_1.2fr_120px_110px_100px] gap-x-4 border-b border-border/60 px-5 py-4 text-[13px] last:border-b-0 hover:bg-ground/60"
                >
                  <span className="font-semibold text-ink">
                    {row.firstName} {row.lastName}
                  </span>
                  <span className="min-w-0 truncate text-secondary">
                    {row.email}
                    {row.company ? ` · ${row.company}` : ""}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                  </span>
                  <span className="text-center text-[12px] text-ink">
                    {appStatusLabel(row.status)}
                  </span>
                  <span className="text-right text-[11px] text-accent">Review →</span>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
