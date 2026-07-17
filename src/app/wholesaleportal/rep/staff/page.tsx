import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listStaff } from "@/lib/firestore/staff";
import { fullDate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { InviteStaffForm } from "@/components/InviteStaffForm";
import { StaffMemberActions } from "@/components/StaffMemberActions";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getSession();
  if (!session || (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)) {
    redirect("/wholesaleportal/sign-in");
  }
  if (session.role !== ROLE.MANAGER) {
    redirect("/wholesaleportal/rep");
  }

  const staff = await listStaff();

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Staff</h1>
        <span className="text-[12px] text-muted">
          Firestore `salesPortalStaff` · invite, admin access, passwords
        </span>
      </div>

      <InviteStaffForm />

      {staff.length === 0 ? (
        <EmptyState
          title="No staff yet."
          hint="Invite a teammate above — they'll be able to sign in on the staff portal immediately."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1.2fr_1.4fr_90px_90px_120px_1.4fr] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Last login</span>
            <span className="text-right">Actions</span>
          </div>
          {staff.map((s) => {
            const isSelf = s.id === session.id;
            return (
              <div
                key={s.id}
                className="grid grid-cols-[1.2fr_1.4fr_90px_90px_120px_1.4fr] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0"
              >
                <span className="font-semibold text-ink">
                  {s.displayName || "—"}
                  {isSelf ? (
                    <span className="ml-1.5 font-normal text-muted">(you)</span>
                  ) : null}
                </span>
                <span className="truncate">{s.email || "—"}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  {s.isAdmin ? "Admin" : "Staff"}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  {s.status}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {s.lastLoginAt ? fullDate(s.lastLoginAt) : "—"}
                </span>
                <StaffMemberActions
                  staffId={s.id}
                  isAdmin={s.isAdmin}
                  status={s.status}
                  isSelf={isSelf}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
