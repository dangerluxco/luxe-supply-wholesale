import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { expandQuoteAllSkus, getQuoteById, listQuotesForBuyer } from "@/lib/firestore/quotes";
import { getCatalogProductsBySkus, loadInventoryCostsBySkus } from "@/lib/firestore/catalog";
import type { QuoteLineContext } from "@/components/QuoteItemsEditor";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { listInvoicesForBuyer } from "@/lib/firestore/invoices";
import { computeBuyerAccountMetrics, type BuyerAccountMetrics } from "@/lib/buyerAccount";
import type { PortalBuyer } from "@/lib/firestore/buyers";
import { TierBadge } from "@/components/badges";
import { invoiceRequestDaysLeft, PAYMENT_TIERS } from "@/lib/constants";
import { QuoteStatusSelect } from "@/components/QuoteStatusSelect";
import { QuoteNotesForm } from "@/components/QuoteNotesForm";
import { QuoteActivityThread } from "@/components/QuoteActivityThread";
import { listQuoteActivities } from "@/lib/firestore/quoteActivities";
import { QuoteItemsEditor } from "@/components/QuoteItemsEditor";
import { QuoteClaimControls } from "@/components/QuoteClaimControls";
import { QuoteShippingEditor } from "@/components/QuoteShippingEditor";
import { getShippingRules } from "@/lib/firestore/settings";
import { GenerateInvoiceButton } from "@/components/GenerateInvoiceButton";
import { BookCallButton } from "@/components/BookCallButton";
import { RequestCallButton } from "@/components/RequestCallButton";
import { OpenCurationViewButton } from "@/components/OpenCurationViewButton";
import { InfoTip } from "@/components/InfoTip";
import { fullDate, money } from "@/lib/format";
import { buyerStorefrontOrigin } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Client context for the deal screen — tier, terms, credit, payment history.
 * Everything here already existed on the client detail page; joining it onto
 * the quote means a rep prices Net-30 decisions without leaving the request.
 * Best-effort: any failure (guest checkout, Firestore hiccup) renders nothing.
 */
async function loadBuyerAccountContext(
  username: string,
): Promise<{ buyer: PortalBuyer; metrics: BuyerAccountMetrics } | null> {
  if (!username) return null;
  try {
    const buyer = await findBuyerByIdentifier(username);
    if (!buyer) return null;
    const [quotes, invoices] = await Promise.all([
      listQuotesForBuyer(buyer.username, 30),
      listInvoicesForBuyer(buyer.username),
    ]);
    return { buyer, metrics: computeBuyerAccountMetrics(invoices, quotes) };
  } catch {
    return null;
  }
}

/**
 * Cost / comp / stock facts for every SKU on the request (lot members included)
 * so the line editor can show live margin and flag sold/held-elsewhere pieces
 * right where prices are set. Best-effort: failures render a plain editor.
 */
async function loadLineContext(
  items: Array<Record<string, unknown>>,
  buyerUsername: string,
): Promise<Record<string, QuoteLineContext>> {
  const out: Record<string, QuoteLineContext> = {};
  try {
    const skus = expandQuoteAllSkus(items);
    if (!skus.length) return out;
    // Costs come from raw inventory (IIQItemDetails) — quote lines routinely
    // leave the curated storefront catalog (sold, de-listed), and margin must
    // survive that. Stock/comp facts layer on top when the piece still resolves.
    const [costs, map] = await Promise.all([
      loadInventoryCostsBySkus(skus),
      getCatalogProductsBySkus(skus, {
        includeBundled: true,
        buyerUsername: buyerUsername || null,
      }).catch(() => new Map<string, never>()),
    ]);
    for (const sku of skus) {
      const p = map.get(sku) || map.get(sku.toUpperCase());
      const cost = costs.get(sku) ?? p?.cost ?? null;
      if (!p && cost == null) continue;
      out[sku.toUpperCase()] = {
        cost,
        compAvg: p?.hostCompAvgUsd ?? null,
        soldOut: p?.soldOut ?? false,
        heldByOther: p?.held ?? false,
        heldUntil: p?.heldUntil ?? null,
      };
    }
  } catch {
    // fall through with whatever resolved
  }
  return out;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

export default async function StaffQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role === ROLE.BUYER) redirect("/wholesaleportal/sign-in");

  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) notFound();
  const [activities, account, lineContext, shippingRules] = await Promise.all([
    listQuoteActivities(quote.id).catch(() => []),
    loadBuyerAccountContext(quote.portalUsername),
    loadLineContext(quote.items, quote.portalUsername),
    getShippingRules().catch(() => null),
  ]);

  const initialCurationUrl = quote.curationToken
    ? `${buyerStorefrontOrigin()}/curation/${quote.curationToken}`
    : null;
  const initialSellerCurationUrl = quote.curationToken
    ? `/wholesaleportal/rep/curation/${quote.curationToken}`
    : null;

  return (
    <div className="px-10 pb-12 pt-8">
      <Link href="/wholesaleportal/rep" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to order requests
      </Link>

      <div className="mb-6 mt-3">
        <h1 className="flex items-center gap-2 text-[24px] font-semibold text-ink">
          {quote.customerName || quote.buyerDisplayName || "Order request"}
          <InfoTip label="Holds and sold status on this request">
            Line items stay soft-held for the buyer until you invoice (sold + off store),
            decline/close (holds released), remove a line (that SKU’s hold releases), or the
            request times out after 7 days (holds released; suggested lots in the request
            deactivate).
          </InfoTip>
        </h1>
        <span className="font-mono text-[11px] text-muted">#{quote.id}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-stretch gap-4">
        <div className="min-w-[160px] rounded-card border border-border bg-surface px-4 py-3">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">STATUS</div>
          <QuoteStatusSelect quoteId={quote.id} status={quote.status} />
        </div>
        <div className="min-w-[220px] max-w-sm rounded-card border border-border bg-surface px-4 py-3">
          <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-accent">ASSIGNED</div>
          <QuoteClaimControls
            quoteId={quote.id}
            claimedByEmail={quote.claimedByEmail}
            claimedByName={quote.claimedByName}
            currentStaffEmail={session.email}
          />
        </div>
        <div className="min-w-[220px] max-w-sm rounded-card border border-border bg-surface px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">CLIENT CALL</div>
            <InfoTip label="Requesting vs booking a call">
              Request a call first — it emails the buyer asking for a few times that work
              (replies go straight to you). Once they answer, Book call creates a fresh
              curation link from this request&apos;s items (valid 7 days) and opens a
              pre-filled Google Calendar event with the buyer as guest; the invite includes
              both the buyer link and your seller curation manager link.
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <RequestCallButton quoteId={quote.id} initialRequestedAt={quote.callRequestedAt} />
            <BookCallButton
              quoteId={quote.id}
              buyerEmail={quote.customerEmail}
              initialCurationUrl={initialCurationUrl}
              initialSellerCurationUrl={initialSellerCurationUrl}
            />
          </div>
        </div>
        <div className="min-w-[220px] max-w-sm rounded-card border border-border bg-surface px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">CURATION</div>
            <InfoTip label="Jumping straight into curation">
              Opens the curation working view for this order — no calendar invite, just the
              session. Reuses this order&apos;s curation link if one already exists (from a
              past &quot;Book call&quot; or a previous visit here); otherwise creates one from
              the order&apos;s current items. Ending the session syncs this order automatically:
              items already on the order stay unless declined (holds released if so); anything
              you added live during the call only joins the order if it was approved.
            </InfoTip>
          </div>
          <OpenCurationViewButton
            quoteId={quote.id}
            initialSellerCurationUrl={initialSellerCurationUrl}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
                  LINE ITEMS
                </div>
                <InfoTip label="Removing a line item">
                  Saving a removal releases that SKU’s soft hold so it can be purchased again
                  on the storefront (unless it’s still in another open request or active lot).
                </InfoTip>
              </div>
              <span className="text-[11px] text-muted">Remove products or adjust prices below.</span>
            </div>
            <QuoteItemsEditor quoteId={quote.id} items={quote.items} context={lineContext} />
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              BUYER MESSAGE
            </div>
            {quote.poNumber ? (
              <p className="mb-2 text-[12.5px] text-secondary">
                PO number: <span className="font-mono text-ink">{quote.poNumber}</span>
              </p>
            ) : null}
            <p className="whitespace-pre-wrap text-[12.5px] text-secondary">
              {quote.message || "No message included with this request."}
            </p>
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              ADMIN NOTES
            </div>
            <QuoteNotesForm quoteId={quote.id} adminNotes={quote.adminNotes} />
          </div>

          <QuoteActivityThread quoteId={quote.id} activities={activities} />
        </div>

        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              INVOICE
            </div>
            {quote.invoiceId ? (
              <div className="space-y-2 text-[12.5px]">
                <p className="text-secondary">
                  Formal invoice{" "}
                  <span className="font-mono text-ink">{quote.invoiceNumber}</span> has been
                  generated from this request.
                </p>
                <a
                  href={`/wholesaleportal/rep/invoices/${quote.invoiceId}`}
                  className="inline-flex h-9 items-center rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary transition hover:border-accent hover:text-ink"
                >
                  View invoice →
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12.5px] text-secondary">
                  Once pricing is finalized, generate a formal Net-30 invoice from this
                  request&apos;s current line items.
                </p>
                <GenerateInvoiceButton quoteId={quote.id} disabled={quote.items.length === 0} />
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              TOTALS
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row
                label="Merchandise"
                value={quote.cartTotal != null ? money(Math.round(quote.cartTotal)) : "—"}
              />
              {shippingRules ? (
                <QuoteShippingEditor
                  quoteId={quote.id}
                  shippingLabel={quote.shippingLabel}
                  shipping={quote.shipping || 0}
                  comped={!!quote.shippingComp}
                  cartTotal={Math.round(quote.cartTotal || 0)}
                  methods={shippingRules.methods.map((m) => ({
                    id: m.id,
                    label: m.label,
                    price: m.price,
                    compEligible: m.compEligible,
                    enabled: m.enabled,
                  }))}
                  freeShippingThreshold={shippingRules.freeShippingThreshold}
                  locked={!!quote.invoiceId}
                />
              ) : (
                <Row
                  label={quote.shippingLabel ? `Shipping · ${quote.shippingLabel}` : "Shipping"}
                  value={
                    quote.shippingComp ? "Free · comped" : money(Math.round(quote.shipping || 0))
                  }
                />
              )}
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
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">BUYER</div>
              {account ? (
                <Link
                  href={`/wholesaleportal/rep/clients/${account.buyer.id}`}
                  className="text-[11px] text-secondary transition hover:text-ink"
                >
                  Open client record →
                </Link>
              ) : null}
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Name" value={quote.customerName || quote.buyerDisplayName || "—"} />
              <Row label="Email" value={quote.customerEmail || "—"} />
              <Row label="Company" value={quote.customerCompany || "—"} />
              <Row label="Phone" value={quote.customerPhone || "—"} />
              <Row
                label="Username"
                value={quote.portalUsername ? `@${quote.portalUsername}` : "guest"}
              />
            </div>
          </div>

          {account ? (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
                  ACCOUNT
                </div>
                <InfoTip label="Why this is here">
                  Trust and payment context for pricing this deal — the same numbers as the
                  client record, so you don&apos;t have to leave the request to decide on
                  terms or discounts.
                </InfoTip>
              </div>
              <div className="mb-3">
                <TierBadge tier={account.buyer.paymentTier} />
              </div>
              <div className="space-y-2 text-[12.5px]">
                <Row
                  label="Terms"
                  value={
                    account.buyer.paymentTerms ||
                    PAYMENT_TIERS.find((t) => t.tier === account.buyer.paymentTier)
                      ?.defaultTerms ||
                    "—"
                  }
                />
                <Row
                  label="Credit limit"
                  value={
                    account.buyer.creditLimit != null
                      ? money(Math.round(account.buyer.creditLimit))
                      : "Not set"
                  }
                />
                <Row
                  label="Outstanding"
                  value={
                    account.metrics.outstanding > 0
                      ? `${money(Math.round(account.metrics.outstanding))} · ${account.metrics.outstandingCount} open`
                      : "$0"
                  }
                />
                {account.buyer.creditLimit != null ? (
                  <Row
                    label="Credit remaining"
                    value={money(
                      Math.round(
                        Math.max(0, account.buyer.creditLimit - account.metrics.outstanding),
                      ),
                    )}
                  />
                ) : null}
                <Row
                  label="Lifetime purchases"
                  value={money(Math.round(account.metrics.lifetimePurchases))}
                />
                <Row
                  label="Avg order"
                  value={
                    account.metrics.avgOrderValue != null
                      ? money(Math.round(account.metrics.avgOrderValue))
                      : "—"
                  }
                />
                <Row
                  label="On-time payment"
                  value={
                    account.metrics.onTimePaymentRate != null
                      ? `${account.metrics.onTimePaymentRate}%`
                      : "No history"
                  }
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              TIMELINE
            </div>
            <div className="space-y-2 text-[12.5px]">
              <Row label="Submitted" value={fullDate(quote.createdAt)} />
              <Row label="Last updated" value={fullDate(quote.updatedAt)} />
              {(() => {
                const left = invoiceRequestDaysLeft(quote.createdAt, quote.status);
                if (left == null) return null;
                return (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Times out</span>
                    <span
                      className={`text-right ${
                        left <= 2 ? "font-semibold text-danger" : "text-ink"
                      }`}
                    >
                      {left <= 0 ? "today — holds release" : `in ${left} day${left === 1 ? "" : "s"}`}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
