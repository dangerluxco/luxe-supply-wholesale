import type { PortalQuote } from "@/lib/firestore/quotes";
import type { PortalInvoice } from "@/lib/firestore/invoices";
import type { PortalBuyer } from "@/lib/firestore/buyers";
import type { BuyerRegistrationRequest } from "@/lib/firestore/registrationRequests";
import { INVOICE_REQUEST_TIMEOUT_DAYS } from "@/lib/constants";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set(["open", "contacted"]);
const NO_REPLY_DAYS = 2;
const INVOICE_DUE_SOON_DAYS = 10;
const PIPELINE_STATUSES = [
  { key: "open", label: "Open" },
  { key: "contacted", label: "Contacted" },
  { key: "quoted", label: "Invoiced" },
  // Synthetic: invoiced + packed, held for payment (pay-first buyers).
  // Not a stored quote status — derived via pipelineKeyFor().
  { key: "fulfilled", label: "Fulfilled" },
  { key: "timed_out", label: "Timed out" },
] as const;

/** Board column for a quote — "fulfilled" is derived, everything else is the stored status. */
function pipelineKeyFor(q: PortalQuote): string {
  return q.status === "quoted" && q.fulfilledAt && !q.shippedAt ? "fulfilled" : q.status;
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / DAY_MS);
}

function elapsedShort(iso: string | null, now: number): string {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export type DashboardKpis = {
  openRequests: { count: number; totalValue: number };
  invoicedNet30: { total: number; count: number };
  catalogValue: { total: number; count: number; approximate: boolean };
  buyers: { total: number; active: number; invited: number };
  pendingApplications: { count: number };
};

export type PipelineCard = {
  id: string;
  name: string;
  subtitle: string;
  total: number;
  href: string;
  /** Claimed by the viewing staffer — gets the "yours" highlight. */
  mine: boolean;
};

export type PipelineColumn = {
  key: string;
  label: string;
  count: number;
  cards: PipelineCard[];
};

export type PipelineTableRow = {
  id: string;
  name: string;
  email: string;
  itemCount: number;
  total: number;
  statusKey: string;
  statusLabel: string;
  waiting: string;
  href: string;
  mine: boolean;
};

export type NeedsAttentionItem = {
  id: string;
  kind: "request" | "invoice" | "application" | "client";
  label: string;
  detail: string;
  href: string;
};

export type RepDashboardData = {
  kpis: DashboardKpis;
  pipeline: PipelineColumn[];
  pipelineTable: PipelineTableRow[];
  needsAttention: NeedsAttentionItem[];
};

export function computeRepDashboard(input: {
  quotes: PortalQuote[];
  invoices: PortalInvoice[];
  buyers: PortalBuyer[];
  pendingApplications: BuyerRegistrationRequest[];
  catalogValue: { total: number; count: number; approximate: boolean };
  /** Viewing staffer — their claimed requests get the "yours" highlight. */
  currentEmail?: string;
  now?: Date;
}): RepDashboardData {
  const now = (input.now ?? new Date()).getTime();
  const me = String(input.currentEmail || "").trim().toLowerCase();
  const isMine = (q: PortalQuote): boolean =>
    !!me && String(q.claimedByEmail || "").trim().toLowerCase() === me;

  const openQuotes = input.quotes.filter((q) => OPEN_STATUSES.has(q.status));
  const openRequests = {
    count: openQuotes.length,
    totalValue: openQuotes.reduce((s, q) => s + (q.cartTotal || 0) + (q.shipping || 0), 0),
  };

  const sentInvoices = input.invoices.filter((inv) => inv.status === "SENT");
  const invoicedNet30 = {
    total: sentInvoices.reduce((s, inv) => s + (inv.total || 0), 0),
    count: sentInvoices.length,
  };

  const buyers = {
    total: input.buyers.length,
    active: input.buyers.filter((b) => b.status === "active").length,
    invited: input.buyers.filter((b) => b.status === "invited").length,
  };

  const kpis: DashboardKpis = {
    openRequests,
    invoicedNet30,
    catalogValue: input.catalogValue,
    buyers,
    pendingApplications: { count: input.pendingApplications.length },
  };

  const pipelineQuotes = input.quotes.filter((q) =>
    PIPELINE_STATUSES.some((p) => p.key === pipelineKeyFor(q)),
  );
  const pipeline: PipelineColumn[] = PIPELINE_STATUSES.map(({ key, label }) => {
    const inColumn = pipelineQuotes
      .filter((q) => pipelineKeyFor(q) === key)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return {
      key,
      label,
      count: inColumn.length,
      cards: inColumn.slice(0, 6).map((q) => {
        // Surface the timeout cliff (not just elapsed time) while it can still
        // be acted on — holds release and lots deactivate when it hits.
        let timeoutNote = "";
        if (OPEN_STATUSES.has(q.status) && q.createdAt) {
          const t = new Date(q.createdAt).getTime();
          if (Number.isFinite(t)) {
            const left = Math.ceil((t + INVOICE_REQUEST_TIMEOUT_DAYS * DAY_MS - now) / DAY_MS);
            if (left <= 2) {
              timeoutNote = left <= 0 ? " · ⚠ times out today" : ` · ⚠ times out in ${left}d`;
            }
          }
        }
        return {
          id: q.id,
          name: q.customerName || q.buyerDisplayName || q.customerEmail || "—",
          subtitle: `${q.portalUsername ? `@${q.portalUsername}` : "guest"} · ${q.itemCount} item${
            q.itemCount === 1 ? "" : "s"
          } · waiting ${elapsedShort(q.createdAt, now)}${timeoutNote}`,
          total: Math.round((q.cartTotal || 0) + (q.shipping || 0)),
          href: `/wholesaleportal/rep/quotes/${q.id}`,
          mine: isMine(q),
        };
      }),
    };
  });

  const statusLabelByKey = new Map<string, string>(PIPELINE_STATUSES.map((p) => [p.key, p.label]));
  const pipelineTable: PipelineTableRow[] = pipelineQuotes
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((q) => ({
      id: q.id,
      name: q.customerName || q.buyerDisplayName || q.customerEmail || "—",
      email: q.customerEmail || "",
      itemCount: q.itemCount,
      total: Math.round((q.cartTotal || 0) + (q.shipping || 0)),
      statusKey: pipelineKeyFor(q),
      statusLabel: statusLabelByKey.get(pipelineKeyFor(q)) || q.status,
      waiting: elapsedShort(q.createdAt, now),
      href: `/wholesaleportal/rep/quotes/${q.id}`,
      mine: isMine(q),
    }));

  type Candidate = { item: NeedsAttentionItem; weight: number; age: number };
  const candidates: Candidate[] = [];

  for (const q of openQuotes) {
    const age = daysSince(q.createdAt, now);
    if (age == null || age < NO_REPLY_DAYS) continue;
    const name = q.customerName || q.buyerDisplayName || q.customerEmail || "A buyer";
    candidates.push({
      weight: 2,
      age,
      item: {
        id: `request-${q.id}`,
        kind: "request",
        label: `${name} — open ${age}d, no reply yet`,
        detail: `$${Math.round((q.cartTotal || 0) + (q.shipping || 0)).toLocaleString("en-US")} · ${q.itemCount} items`,
        href: `/wholesaleportal/rep/quotes/${q.id}`,
      },
    });
  }

  for (const inv of sentInvoices) {
    if (!inv.dueDate) continue;
    const dueInDays = Math.ceil((new Date(inv.dueDate).getTime() - now) / DAY_MS);
    const overdue = dueInDays < 0;
    if (!overdue && dueInDays > INVOICE_DUE_SOON_DAYS) continue;
    const ref = inv.invoiceNumber || inv.id;
    candidates.push({
      weight: overdue ? 0 : 1,
      age: overdue ? -dueInDays : INVOICE_DUE_SOON_DAYS - dueInDays,
      item: {
        id: `invoice-${inv.id}`,
        kind: "invoice",
        label: overdue
          ? `${ref} overdue by ${Math.abs(dueInDays)}d — unpaid`
          : `${ref} due in ${dueInDays}d — unpaid`,
        detail: `${inv.customerName || inv.customerCompany || "—"} · $${Math.round(inv.total || 0).toLocaleString("en-US")}`,
        href: `/wholesaleportal/rep/invoices/${inv.id}`,
      },
    });
  }

  for (const app of input.pendingApplications) {
    const age = daysSince(app.createdAt, now);
    if (age == null) continue;
    const name = [app.firstName, app.lastName].filter(Boolean).join(" ") || app.email || "Applicant";
    candidates.push({
      weight: 3,
      age,
      item: {
        id: `application-${app.id}`,
        kind: "application",
        label: `Pending review — ${age}d old`,
        detail: `${name}${app.company ? ` · ${app.company}` : ""}`,
        href: `/wholesaleportal/rep/applications/${app.id}`,
      },
    });
  }

  const neverSignedIn = input.buyers.filter((b) => b.status === "invited" && !b.lastLoginAt);
  if (neverSignedIn.length > 0) {
    candidates.push({
      weight: 4,
      age: 0,
      item: {
        id: "client-never-signed-in",
        kind: "client",
        label: `${neverSignedIn.length} buyer${neverSignedIn.length === 1 ? "" : "s"} invited, never signed in`,
        detail: neverSignedIn
          .slice(0, 3)
          .map((b) => b.displayName || b.username)
          .join(", "),
        href: "/wholesaleportal/rep/clients",
      },
    });
  }

  const needsAttention = candidates
    .sort((a, b) => (a.weight !== b.weight ? a.weight - b.weight : b.age - a.age))
    .slice(0, 8)
    .map((c) => c.item);

  return { kpis, pipeline, pipelineTable, needsAttention };
}
