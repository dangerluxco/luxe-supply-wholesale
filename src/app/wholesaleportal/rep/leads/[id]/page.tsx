import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getLeadById, listLeadActivities } from "@/lib/firestore/leads";
import { LeadDetail } from "@/components/LeadDetail";
import { requirePortalFeature } from "@/lib/require-feature";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role === ROLE.BUYER) redirect("/wholesaleportal/sign-in");
  await requirePortalFeature("leads");

  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const activities = await listLeadActivities(id).catch(() => []);

  return (
    <div className="px-10 pb-12 pt-8">
      <Link href="/wholesaleportal/rep/leads" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to leads
      </Link>
      <div className="mt-3">
        <LeadDetail initialLead={lead} initialActivities={activities} currentStaffEmail={session.email} />
      </div>
    </div>
  );
}
