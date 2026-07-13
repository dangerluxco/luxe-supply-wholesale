import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { money, fullDate } from "@/lib/format";
import { InvoiceBadge } from "@/components/badges";
import { PrintButton } from "@/components/PrintButton";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await getSession();
  const inv = await prisma.invoice.findUnique({
    where: { number },
    include: { account: { include: { assignedRep: true } } },
  });
  if (!inv || inv.accountId !== session?.accountId) notFound();

  const line: { name: string; sku: string; price: number }[] = JSON.parse(inv.lineItems);
  const addressLines: string[] = JSON.parse(inv.account.addressLines);

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/portal/invoices" className="text-[12px] text-muted hover:text-ink">
          ← All invoices
        </Link>
        <div className="flex items-center gap-2.5">
          <a
            href={`/portal/invoices/${inv.number}/csv`}
            className="flex h-10 items-center rounded-chip border border-border px-5 text-[12px] uppercase tracking-[0.12em] text-secondary transition hover:border-accent"
          >
            Download CSV ↓
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-10 print:border-0">
        {/* header */}
        <div className="flex items-start justify-between border-b border-border pb-6">
          <div>
            <Logo />
            <div className="mt-2 text-[11px] leading-relaxed text-muted">
              Luxe Supply Co. · One-of-one luxury goods
              <br />
              Geneva Vault · Genève, CH
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[22px] font-semibold text-ink">{inv.number}</div>
            <div className="mt-1.5">
              <InvoiceBadge status={inv.status} />
            </div>
          </div>
        </div>

        {/* meta */}
        <div className="grid grid-cols-2 gap-8 py-6 text-[12.5px]">
          <div>
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-muted">BILL TO</div>
            <div className="leading-relaxed text-[#3A3934]">
              <div className="font-semibold text-ink">{inv.account.company}</div>
              {addressLines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
              <div className="text-muted">{inv.account.email}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-2 self-start">
            <Meta k="Issued" v={fullDate(inv.issuedAt)} />
            <Meta k="Due" v={inv.dueDate ? fullDate(inv.dueDate) : "—"} />
            <Meta k="Terms" v={inv.terms} />
            <Meta k="PO number" v={inv.poNumber ?? "—"} />
            {inv.account.assignedRep ? (
              <Meta k="Sales rep" v={inv.account.assignedRep.name} />
            ) : null}
            {inv.paidAt ? <Meta k="Paid" v={fullDate(inv.paidAt)} /> : null}
          </div>
        </div>

        {/* line items */}
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-[1fr_120px_110px] border-b border-border pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Piece</span>
            <span>SKU</span>
            <span className="text-right">Wholesale</span>
          </div>
          {line.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_120px_110px] items-center border-b border-border/60 py-3 text-[12.5px]"
            >
              <span className="text-ink">
                {l.name}{" "}
                <span className="ml-1 rounded border border-ink px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] text-ink">
                  1/1
                </span>
              </span>
              <span className="font-mono text-muted">{l.sku}</span>
              <span className="text-right font-mono text-ink">{money(l.price)}</span>
            </div>
          ))}
        </div>

        {/* totals */}
        <div className="ml-auto mt-6 w-64 text-[12.5px]">
          <Total k="Subtotal" v={money(inv.subtotal)} />
          <Total k="Insured shipping" v={money(inv.shipping)} />
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-[13px] font-semibold text-ink">Invoice total</span>
            <span className="font-mono text-[22px] font-semibold text-ink">{money(inv.total)}</span>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-5 text-[11px] text-muted">
          Payment due within 30 days of issue. Wire details on file. Every piece is one of one and
          insured in transit. Thank you for collecting with Luxe Supply Co.
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="micro-badge text-[9px] tracking-[0.12em] text-muted">{k}</div>
      <div className="mt-0.5 font-mono text-[12px] text-ink">{v}</div>
    </div>
  );
}

function Total({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1 text-secondary">
      {k}
      <span className="font-mono text-ink">{v}</span>
    </div>
  );
}
