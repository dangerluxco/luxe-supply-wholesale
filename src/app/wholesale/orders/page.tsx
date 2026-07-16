import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";
import { listQuotesForBuyer } from "@/lib/firestore/quotes";
import { money, fullDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Submitted",
  contacted: "Seller contacted",
  quoted: "Invoice sent",
  closed: "Closed",
  declined: "Declined",
  timed_out: "Timed out",
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const quotes = await listQuotesForBuyer(session.username || "");

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Order requests</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Orders you submit for review appear here as the sales team works them.
        Full order history is coming with Net-30 invoices.
      </p>

      {quotes.length === 0 ? (
        <EmptyState
          title="You haven't submitted an order request yet."
          hint="Add pieces to your order and submit for review from your cart — it will show up here."
          className="mt-8"
        />
      ) : (
        <div className="mt-8 overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[110px_1fr_80px_100px_140px_120px] gap-x-4 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Date</span>
            <span>Request</span>
            <span className="text-center">Items</span>
            <span className="text-right">Total</span>
            <span className="text-center">Status</span>
            <span className="text-center">Invoice</span>
          </div>
          {quotes.map((q) => (
            <div
              key={q.id}
              className="grid grid-cols-[110px_1fr_80px_100px_140px_120px] gap-x-4 items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0"
            >
              <span className="font-mono text-[11px] text-muted">{fullDate(q.createdAt)}</span>
              <div>
                <div className="text-ink">
                  {q.message ? q.message.slice(0, 70) : "Order request"}
                </div>
                <div className="font-mono text-[11px] text-muted">#{q.id}</div>
              </div>
              <span className="text-center font-mono">{q.itemCount}</span>
              <span className="text-right font-mono">
                {q.cartTotal != null
                  ? money(Math.round(q.cartTotal + (q.shipping || 0)))
                  : "—"}
              </span>
              <span className="text-center text-[11px] uppercase tracking-[0.08em] text-muted">
                {STATUS_LABEL[q.status] || q.status}
              </span>
              <span className="text-center">
                {q.invoiceNumber ? (
                  <Link
                    href={`/wholesale/invoices/${q.invoiceNumber}`}
                    className="font-mono text-[11px] text-accent hover:underline"
                  >
                    {q.invoiceNumber} →
                  </Link>
                ) : (
                  <span className="text-[11px] text-muted">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
