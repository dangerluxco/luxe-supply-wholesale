import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { Performance, type RepStat } from "@/components/Performance";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const session = await getSession();
  if (session!.role !== ROLE.MANAGER) redirect("/rep"); // manager-only view

  const reps = await prisma.user.findMany({ where: { role: ROLE.REP } });

  const stats: RepStat[] = reps.map((r) => ({
    id: r.id,
    name: r.name,
    initials: r.initials,
    title: r.title ?? "specialist",
    isSenior: r.isSenior,
    isNew: (r.title ?? "").includes("junior"),
    sales: r.statSalesQuarter ?? 0,
    invoices: r.statInvoices ?? 0,
    aov: r.statAov ?? 0,
    conversion: r.statConversion ?? 0,
    calls: r.statCalls ?? 0,
    deltaSales: r.statDeltaSales ?? 0,
    monthly: r.statMonthly ? (JSON.parse(r.statMonthly) as number[]) : [],
  }));

  const teamConversion = Math.round(
    stats.reduce((a, b) => a + b.conversion, 0) / Math.max(stats.length, 1),
  );

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-8 py-3">
        <span className="text-[12px] text-muted">
          Manager view · quarter to date
        </span>
        <span className="font-mono text-[11.5px] text-secondary">Q3 2026 · Jul 1 – Sep 30</span>
      </div>
      <Performance reps={stats} teamConversion={teamConversion} />
    </div>
  );
}
