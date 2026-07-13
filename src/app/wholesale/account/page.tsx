import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getBuyerById } from "@/lib/firestore/buyers";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");
  const buyer = session.source === "firestore" ? await getBuyerById(session.id) : null;

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Account</h1>
      <div className="mt-6 max-w-lg space-y-3 rounded-card border border-border bg-surface p-6 text-[13px]">
        <div className="flex justify-between gap-4">
          <span className="text-muted">Name</span>
          <span className="font-semibold text-ink">{buyer?.displayName || session.name}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Username</span>
          <span className="font-mono">{buyer?.username || session.username}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Email</span>
          <span>{buyer?.email || session.email || "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Company</span>
          <span>{buyer?.company || "—"}</span>
        </div>
      </div>
    </div>
  );
}
