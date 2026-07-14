import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import {
  listRegistrationRequests,
  type RegistrationStatus,
} from "@/lib/firestore/registrationRequests";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status;
}

export default async function RegistrationRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }

  const sp = await searchParams;
  const statusFilter =
    sp.status === "pending" || sp.status === "approved" || sp.status === "rejected"
      ? (sp.status as RegistrationStatus)
      : "all";

  const rows = await listRegistrationRequests(statusFilter);

  const tabs: Array<{ id: string; label: string }> = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
  ];

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Registration requests</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Review wholesale access applications — approve to create a buyer login, or reject.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = statusFilter === t.id || (t.id === "all" && statusFilter === "all");
          const href =
            t.id === "all"
              ? "/wholesaleportal/rep/applications"
              : `/wholesaleportal/rep/applications?status=${t.id}`;
          return (
            <Link
              key={t.id}
              href={href}
              className={`rounded-chip px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                active ? "bg-ink text-ground" : "border border-border text-secondary"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No registration requests."
          hint="Applicants submit from /wholesale/register on the storefront."
          className="mt-8"
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1fr_1.2fr_120px_110px_100px] gap-x-4 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Name</span>
            <span>Email / company</span>
            <span>Submitted</span>
            <span className="text-center">Status</span>
            <span />
          </div>
          {rows.map((row) => (
            <Link
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
              <span className="text-center text-[12px] text-ink">{statusLabel(row.status)}</span>
              <span className="text-right text-[11px] text-accent">Review →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
