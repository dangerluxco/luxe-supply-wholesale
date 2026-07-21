import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listLeads, type LeadStatus } from "@/lib/firestore/leads";
import { LeadsList } from "@/components/LeadsList";

export const dynamic = "force-dynamic";

type SP = { [k: string]: string | string[] | undefined };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await getSession();
  if (!session || session.role === ROLE.BUYER) redirect("/wholesaleportal/sign-in");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = (one(sp.status) || "all") as LeadStatus | "all";

  let leads: Awaited<ReturnType<typeof listLeads>> = [];
  let loadError: string | null = null;
  try {
    leads = await listLeads({ status });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load leads.";
    console.warn("[leads] load failed:", loadError);
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Leads</h1>
        <span className="text-[12px] text-muted">
          Business-development pipeline — {leads.length} shown.
        </span>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-chip border border-danger/40 bg-danger/5 px-4 py-3 text-[12.5px] text-danger">
          {loadError}
        </div>
      ) : null}

      <LeadsList initialLeads={leads} initialStatus={status} currentStaffEmail={session.email} />
    </div>
  );
}
