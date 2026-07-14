import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getBuyerById } from "@/lib/firestore/buyers";
import { AccountProfileForm } from "@/components/AccountProfileForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");
  const buyer = session.source === "firestore" ? await getBuyerById(session.id) : null;

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Account</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Manage your contact details and login for {buyer?.username || session.username}
        &apos;s storefront access.
      </p>

      {session.source === "firestore" ? (
        <>
          <div className="mt-6 max-w-lg rounded-chip border border-border bg-ground px-4 py-2.5 text-[12px] text-muted">
            Signed in as <span className="font-mono text-ink">@{buyer?.username || session.username}</span>
          </div>
          <div className="mt-4">
            <AccountProfileForm
              displayName={buyer?.displayName || session.name}
              email={buyer?.email || session.email || ""}
              phone={buyer?.phone || ""}
              company={buyer?.company || ""}
            />
          </div>
          <ChangePasswordForm />
        </>
      ) : (
        <div className="mt-6 max-w-lg space-y-3 rounded-card border border-border bg-surface p-6 text-[13px]">
          <div className="flex justify-between gap-4">
            <span className="text-muted">Name</span>
            <span className="font-semibold text-ink">{session.name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted">Email</span>
            <span>{session.email || "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
