import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listLeads } from "@/lib/firestore/leads";
import { LeadsList } from "@/components/LeadsList";
import { requirePortalFeature } from "@/lib/require-feature";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await getSession();
  if (!session || session.role === ROLE.BUYER) redirect("/wholesaleportal/sign-in");
  await requirePortalFeature("leads");

  let leads: Awaited<ReturnType<typeof listLeads>> = [];
  let loadError: string | null = null;
  try {
    // Load full pipeline so board + table can filter client-side without
    // re-fetching when toggling status / assignee / dates.
    leads = await listLeads({ status: "all", limit: 500 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load leads.";
    console.warn("[leads] load failed:", loadError);
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Leads</h1>
        <span className="text-[12px] text-muted">
          Business-development pipeline — {leads.length} loaded.
        </span>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-chip border border-danger/40 bg-danger/5 px-4 py-3 text-[12.5px] text-danger">
          {loadError}
        </div>
      ) : null}

      <LeadsList initialLeads={leads} currentStaffEmail={session.email} />
    </div>
  );
}
