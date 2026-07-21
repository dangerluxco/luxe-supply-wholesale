import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { searchBuyers } from "@/lib/firestore/buyers";
import { listQuotes } from "@/lib/firestore/quotes";
import { listInvoices } from "@/lib/firestore/invoices";
import { listSuggestedLots } from "@/lib/firestore/suggestedLots";
import { listCatalogProducts } from "@/lib/firestore/catalog";
import { listStaff } from "@/lib/firestore/staff";
import { matchesKeywords } from "@/lib/search";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export type StaffSearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type StaffSearchGroup = { label: string; hits: StaffSearchHit[] };

const PER_GROUP = 5;

/**
 * Global staff-portal search (the ⌘K palette): one query fanned out across
 * clients, order requests, invoices, bundles, catalog SKUs, and staff. Each
 * source degrades independently — one Firestore hiccup shouldn't blank the
 * whole palette.
 */
export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const q = String(new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ groups: [] });
  }

  const [buyers, quotesResult, invoices, lots, catalog, staff] = await Promise.all([
    searchBuyers(q, PER_GROUP).catch(() => []),
    listQuotes({ status: "all", limit: 300 }).catch(() => ({ quotes: [] })),
    listInvoices({ limit: 300 }).catch(() => []),
    listSuggestedLots({ status: "all" }).catch(() => []),
    listCatalogProducts(300).catch(() => ({ products: [] })),
    listStaff().catch(() => []),
  ]);

  const groups: StaffSearchGroup[] = [];

  const clientHits: StaffSearchHit[] = buyers.slice(0, PER_GROUP).map((b) => ({
    id: b.id,
    title: b.displayName || `@${b.username}`,
    subtitle: [b.email, b.company].filter(Boolean).join(" · ") || `@${b.username}`,
    href: `/wholesaleportal/rep/clients/${b.id}`,
  }));
  if (clientHits.length) groups.push({ label: "Clients", hits: clientHits });

  const quoteHits: StaffSearchHit[] = quotesResult.quotes
    .filter((qt) =>
      matchesKeywords(
        [qt.id, qt.customerName, qt.buyerDisplayName, qt.customerEmail, qt.customerCompany, qt.portalUsername].join(" "),
        q,
      ),
    )
    .slice(0, PER_GROUP)
    .map((qt) => ({
      id: qt.id,
      title: qt.customerName || qt.buyerDisplayName || `Request #${qt.id.slice(-6)}`,
      subtitle: `${qt.itemCount} item${qt.itemCount === 1 ? "" : "s"} · ${
        qt.cartTotal != null ? money(Math.round(qt.cartTotal + (qt.shipping || 0))) : "—"
      } · ${qt.status}`,
      href: `/wholesaleportal/rep/quotes/${qt.id}`,
    }));
  if (quoteHits.length) groups.push({ label: "Order Requests", hits: quoteHits });

  const invoiceHits: StaffSearchHit[] = invoices
    .filter((inv) =>
      matchesKeywords(
        [inv.invoiceNumber, inv.customerName, inv.customerCompany, inv.customerEmail, inv.portalUsername].join(" "),
        q,
      ),
    )
    .slice(0, PER_GROUP)
    .map((inv) => ({
      id: inv.id,
      title: inv.invoiceNumber,
      subtitle: `${inv.customerName || inv.customerCompany || "—"} · ${money(Math.round(inv.total || 0))} · ${inv.status}`,
      href: `/wholesaleportal/rep/invoices/${inv.id}`,
    }));
  if (invoiceHits.length) groups.push({ label: "Invoices", hits: invoiceHits });

  const lotHits: StaffSearchHit[] = lots
    .filter((lot) =>
      matchesKeywords(
        [lot.title, lot.buyerDisplayName, lot.buyerUsername, ...lot.items.map((i) => i.sku)].join(" "),
        q,
      ),
    )
    .slice(0, PER_GROUP)
    .map((lot) => ({
      id: lot.id,
      title: lot.title || `${lot.items.length}-piece bundle`,
      subtitle: `${lot.items.length} piece${lot.items.length === 1 ? "" : "s"}${
        lot.lotPrice != null ? ` · ${money(Math.round(lot.lotPrice))}` : ""
      }${lot.buyerDisplayName ? ` · for ${lot.buyerDisplayName}` : ""}`,
      href: `/wholesaleportal/rep/bundles/${lot.id}/edit`,
    }));
  if (lotHits.length) groups.push({ label: "Bundles", hits: lotHits });

  const skuHits: StaffSearchHit[] = catalog.products
    .filter((p) => matchesKeywords([p.title, p.sku, p.brand].join(" "), q))
    .slice(0, PER_GROUP)
    .map((p) => ({
      id: p.sku,
      title: p.title || p.sku,
      subtitle: `${p.sku}${p.brand ? ` · ${p.brand}` : ""}${p.price != null ? ` · ${money(Math.round(p.price))}` : ""}`,
      href: `/wholesaleportal/rep/catalog/${encodeURIComponent(p.sku)}/edit`,
    }));
  if (skuHits.length) groups.push({ label: "Catalog SKUs", hits: skuHits });

  const staffHits: StaffSearchHit[] = staff
    .filter((s) => matchesKeywords([s.displayName, s.email].join(" "), q))
    .slice(0, PER_GROUP)
    .map((s) => ({
      id: s.id,
      title: s.displayName || s.email,
      subtitle: `${s.email} · ${s.isAdmin ? "Manager" : "Rep"}`,
      href: `/wholesaleportal/rep/staff/${s.id}`,
    }));
  if (staffHits.length) groups.push({ label: "Staff", hits: staffHits });

  return NextResponse.json({ groups });
}
