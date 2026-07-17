import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getQuoteById } from "@/lib/firestore/quotes";
import { PortalItemLine, portalDisplayTitle } from "@/components/PortalItemLine";
import { MicroBadge } from "@/components/badges";
import { BundleImageStrip } from "@/components/BundleImageStrip";
import { fullDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Submitted",
  contacted: "Seller contacted",
  quoted: "Invoice sent",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

type LineItem = {
  sku: string;
  title: string;
  brand: string;
  quantity: number;
  price: number;
  imageUrl: string | null;
  isSuggestedLot: boolean;
  lotItems: Array<{ sku: string; title?: string; imageUrl?: string | null }>;
};

function normalizeItems(raw: Array<Record<string, unknown>>): LineItem[] {
  return raw.map((it) => {
    const rawLotItems = Array.isArray(it.lotItems)
      ? (it.lotItems as Array<Record<string, unknown>>)
      : [];
    const lotItems = rawLotItems
      .map((li) => ({
        sku: String(li?.sku || "").trim(),
        title: li?.title ? String(li.title) : undefined,
        imageUrl: li?.imageUrl ? String(li.imageUrl) : null,
      }))
      .filter((li) => li.sku);
    const directImage = typeof it.imageUrl === "string" && it.imageUrl ? it.imageUrl : null;
    const imageUrl =
      directImage || (lotItems.find((li) => li.imageUrl)?.imageUrl ?? null);
    return {
      sku: String(it.sku || ""),
      title: String(it.title || ""),
      brand: String(it.brand || ""),
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
      price: Number(it.price) || 0,
      imageUrl,
      isSuggestedLot: !!it.isSuggestedLot,
      lotItems,
    };
  });
}

export default async function BuyerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const { id } = await params;
  const quote = await getQuoteById(id);
  // Never let one buyer view another buyer's request.
  if (!quote || (quote.portalUsername || "").toLowerCase() !== (session.username || "").toLowerCase()) {
    notFound();
  }

  const items = normalizeItems(quote.items);

  return (
    <div className="px-8 pb-16 pt-8">
      <Link href="/wholesale/orders" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to order requests
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Order request</h1>
        <span className="font-mono text-[11px] text-muted">#{quote.id}</span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-secondary">
          {STATUS_LABEL[quote.status] || quote.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              LINE ITEMS
            </div>
            <div className="space-y-4">
              {items.map((it, index) => (
                <div
                  key={`${it.sku}-${index}`}
                  className="flex items-start justify-between gap-4 border-b border-border/60 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {it.isSuggestedLot ? (
                      <BundleImageStrip
                        images={
                          it.lotItems.length ? it.lotItems.map((li) => li.imageUrl) : [it.imageUrl]
                        }
                        size="sm"
                      />
                    ) : (
                      <PortalItemLine
                        imageUrl={it.imageUrl}
                        title={it.title}
                        sku={it.sku}
                        size="sm"
                        className="min-w-0 flex-1"
                      />
                    )}
                    {it.isSuggestedLot ? (
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <MicroBadge tone="solid-gold">BUNDLE</MicroBadge>
                          <span className="truncate text-[13px] font-medium text-ink">
                            {portalDisplayTitle(it.title, it.sku)}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted">
                          {it.lotItems.length} piece{it.lotItems.length === 1 ? "" : "s"} in this
                          bundle
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[13px] text-ink">{money(Math.round(it.price))}</div>
                    {it.quantity > 1 ? (
                      <div className="font-mono text-[10.5px] text-muted">× {it.quantity}</div>
                    ) : null}
                  </div>
                </div>
              ))}
              {items.length === 0 ? (
                <p className="text-[12.5px] text-muted">No items on this request.</p>
              ) : null}
            </div>
          </div>

          {quote.message ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
                YOUR MESSAGE
              </div>
              <p className="whitespace-pre-wrap text-[12.5px] text-secondary">{quote.message}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {quote.invoiceNumber ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
                INVOICE
              </div>
              <p className="mb-2 text-[12.5px] text-secondary">
                An invoice has been generated for this request.
              </p>
              <Link
                href={`/wholesale/invoices/${quote.invoiceNumber}`}
                className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-accent hover:text-ink"
              >
                View invoice →
              </Link>
            </div>
          ) : null}

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              TOTALS
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row
                label="Merchandise"
                value={quote.cartTotal != null ? money(Math.round(quote.cartTotal)) : "—"}
              />
              <Row
                label={quote.shippingLabel ? `Shipping · ${quote.shippingLabel}` : "Shipping"}
                value={money(Math.round(quote.shipping || 0))}
              />
              <Row
                label="Order total"
                value={
                  quote.cartTotal != null
                    ? money(Math.round(quote.cartTotal + (quote.shipping || 0)))
                    : "—"
                }
              />
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              TIMELINE
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Submitted" value={fullDate(quote.createdAt)} />
              <Row label="Last updated" value={fullDate(quote.updatedAt)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
