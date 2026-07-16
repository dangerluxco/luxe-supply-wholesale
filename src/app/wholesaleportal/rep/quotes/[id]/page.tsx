import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getQuoteById } from "@/lib/firestore/quotes";
import { QuoteStatusSelect } from "@/components/QuoteStatusSelect";
import { QuoteNotesForm } from "@/components/QuoteNotesForm";
import { QuoteItemsEditor } from "@/components/QuoteItemsEditor";
import { QuoteClaimControls } from "@/components/QuoteClaimControls";
import { GenerateInvoiceButton } from "@/components/GenerateInvoiceButton";
import { InfoTip } from "@/components/InfoTip";
import { fullDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";

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

  return (
    <div className="px-10 pb-12 pt-8">
      <a href="/wholesaleportal/rep" className="text-[12px] text-muted transition hover:text-ink">
        ‹ Back to order requests
      </a>

      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-4">
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
        <div className="flex-1" />
        <div className="w-[160px]">
          <QuoteStatusSelect quoteId={quote.id} status={quote.status} />
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
            <QuoteItemsEditor quoteId={quote.id} items={quote.items} />
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              BUYER MESSAGE
            </div>
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
        </div>

        <div className="space-y-6">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
              WORKING ON
            </div>
            <QuoteClaimControls
              quoteId={quote.id}
              claimedByEmail={quote.claimedByEmail}
              claimedByName={quote.claimedByName}
              currentStaffEmail={session.email}
            />
            {quote.claimedAt ? (
              <p className="mt-3 text-[11px] text-muted">Claimed {fullDate(quote.claimedAt)}</p>
            ) : null}
          </div>

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
              BUYER
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
