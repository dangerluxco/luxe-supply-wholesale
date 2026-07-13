import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteById } from "@/lib/firestore/quotes";
import { QuoteStatusSelect } from "@/components/QuoteStatusSelect";
import { QuoteNotesForm } from "@/components/QuoteNotesForm";
import { QuoteItemsEditor } from "@/components/QuoteItemsEditor";
import { fullDate } from "@/lib/format";

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
  const { id } = await params;
  const quote = await getQuoteById(id);
  if (!quote) notFound();

  return (
    <div className="px-10 pb-12 pt-8">
      <Link
        href="/wholesaleportal/rep"
        className="text-[12px] text-muted transition hover:text-ink"
      >
        ‹ Back to invoice requests
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-4">
        <h1 className="text-[24px] font-semibold text-ink">
          {quote.customerName || quote.buyerDisplayName || "Invoice request"}
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
            <div className="mb-3 flex items-baseline justify-between">
              <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
                LINE ITEMS
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
