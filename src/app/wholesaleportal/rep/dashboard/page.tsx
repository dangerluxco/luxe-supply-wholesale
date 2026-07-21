import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listQuotes } from "@/lib/firestore/quotes";
import { listInvoices } from "@/lib/firestore/invoices";
import { listBuyers } from "@/lib/firestore/buyers";
import { listRegistrationRequests } from "@/lib/firestore/registrationRequests";
import { getCatalogSettingsState, listCatalogProducts } from "@/lib/firestore/catalog";
import { computeRepDashboard } from "@/lib/repDashboard";
import { RepPipelineBoard } from "@/components/RepPipelineBoard";
import { NeedsAttentionPanel } from "@/components/NeedsAttentionPanel";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

async function loadCatalogValue(): Promise<{ total: number; count: number; approximate: boolean }> {
  try {
    const state = await getCatalogSettingsState();
    if (state.mode === "sku_list" && state.curatedCatalog?.items.length) {
      const priced = state.curatedCatalog.items.filter((i) => i.price != null);
      return {
        total: priced.reduce((s, i) => s + (i.price || 0), 0),
        count: priced.length,
        approximate: false,
      };
    }
    const { products, hasMore } = await listCatalogProducts(800);
    return {
      total: products.reduce((s, p) => s + (p.price || 0), 0),
      count: products.length,
      approximate: hasMore,
    };
  } catch (err) {
    console.warn("[rep dashboard] catalog value unavailable:", err instanceof Error ? err.message : err);
    return { total: 0, count: 0, approximate: true };
  }
}

function MetricCard({
  label,
  value,
  caption,
  highlight,
  href,
}: {
  label: string;
  value: string;
  caption?: string;
  highlight?: boolean;
  href?: string;
}) {
  const className =
    "rounded-card border p-4 " +
    (highlight ? "border-accent bg-accent/15" : "border-border bg-surface") +
    (href ? " block transition hover:border-accent" : "");
  const content = (
    <>
      <div className="micro-badge mb-2 text-[9.5px] tracking-[0.14em] text-muted">{label}</div>
      <div className="font-mono text-[21px] font-semibold text-ink">{value}</div>
      {caption ? <div className="mt-1 text-[11px] text-muted">{caption}</div> : null}
    </>
  );
  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }
  return <div className={className}>{content}</div>;
}

export default async function StaffDashboardPage() {
  const session = await getSession();
  if (!session || session.role === ROLE.BUYER) redirect("/wholesaleportal/sign-in");

  let quotesResult: Awaited<ReturnType<typeof listQuotes>> = {
    quotes: [],
    openCount: 0,
    organizationId: "",
  };
  let invoices: Awaited<ReturnType<typeof listInvoices>> = [];
  let buyers: Awaited<ReturnType<typeof listBuyers>> = [];
  let pendingApplications: Awaited<ReturnType<typeof listRegistrationRequests>> = [];
  let catalogValue = { total: 0, count: 0, approximate: true };

  try {
    [quotesResult, invoices, buyers, pendingApplications, catalogValue] = await Promise.all([
      listQuotes({ status: "all", limit: 300 }),
      listInvoices({ limit: 300 }),
      listBuyers(),
      listRegistrationRequests("pending"),
      loadCatalogValue(),
    ]);
  } catch (err) {
    console.warn("[rep dashboard] Firestore unavailable:", err instanceof Error ? err.message : err);
  }

  const { kpis, pipeline, pipelineTable, needsAttention } = computeRepDashboard({
    quotes: quotesResult.quotes,
    invoices,
    buyers,
    pendingApplications,
    catalogValue,
  });

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-[13px] text-muted">Rep pipeline &amp; account health at a glance.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="OPEN REQUESTS"
          value={String(kpis.openRequests.count)}
          caption={`${money(kpis.openRequests.totalValue)} total value`}
        />
        <MetricCard
          label="INVOICED · NET-30"
          value={money(kpis.invoicedNet30.total)}
          caption={`${kpis.invoicedNet30.count} sent, unpaid`}
        />
        <MetricCard
          label="CATALOG VALUE"
          value={money(kpis.catalogValue.total)}
          caption={`${kpis.catalogValue.count}${kpis.catalogValue.approximate ? "+" : ""} pieces live`}
        />
        <MetricCard
          label="BUYERS"
          value={String(kpis.buyers.total)}
          caption={`${kpis.buyers.active} active, ${kpis.buyers.invited} invited`}
          href="/wholesaleportal/rep/clients"
        />
        <MetricCard
          label="PENDING APPLICATIONS"
          value={String(kpis.pendingApplications.count)}
          caption={kpis.pendingApplications.count > 0 ? "awaiting review" : "all clear"}
          highlight={kpis.pendingApplications.count > 0}
          href="/wholesaleportal/rep/clients?tab=applications"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <RepPipelineBoard columns={pipeline} table={pipelineTable} />
        <NeedsAttentionPanel items={needsAttention} />
      </div>
    </div>
  );
}
