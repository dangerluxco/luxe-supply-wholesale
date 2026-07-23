import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getInvoiceByNumber, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { money, fullDate } from "@/lib/format";
import { trackingUrlFor } from "@/lib/tracking";
import { getFulfillmentForInvoice } from "@/lib/firestore/fulfillment";
import { InvoiceBadge, FulfillmentBadge } from "@/components/badges";
import { ShipmentTracking, shipmentBoxesFromRecord } from "@/components/ShipmentTracking";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const inv = await getInvoiceByNumber(decodeURIComponent(number));
  if (!inv || inv.portalUsername !== session.username) notFound();

  const status = displayInvoiceStatus(inv);
  // Multi-box shipments: per-item box + tracking mapping from fulfillment.
  const fulfillment =
    inv.fulfillmentStatus === "SHIPPED"
      ? await getFulfillmentForInvoice(inv.id).catch(() => null)
      : null;
  const shipmentBoxes = shipmentBoxesFromRecord(fulfillment);

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/wholesale/invoices" className="text-[12px] text-muted hover:text-ink">
          ← All invoices
        </Link>
        <div className="flex items-center gap-2.5">
          <a
            href={`/wholesale/invoices/${inv.invoiceNumber}/csv`}
            className="flex h-10 items-center rounded-chip border border-border px-5 text-[12px] uppercase tracking-[0.12em] text-secondary transition hover:border-accent"
          >
            Download CSV ↓
          </a>
          <a
            href={`/wholesale/invoices/${inv.invoiceNumber}/pdf`}
            className="flex h-10 items-center rounded-chip bg-ink px-5 text-[12px] uppercase tracking-[0.12em] text-ground transition hover:opacity-90"
          >
            Download PDF ↓
          </a>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-10 print:border-0">
        <div className="flex items-start justify-between border-b border-border pb-6">
          <div>
            <Logo />
            <div className="mt-2 text-[11px] leading-relaxed text-muted">
              Luxe Supply Co. · One-of-one luxury goods
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[22px] font-semibold text-ink">{inv.invoiceNumber}</div>
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <InvoiceBadge status={status} />
              <FulfillmentBadge status={inv.fulfillmentStatus} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 py-6 text-[12.5px]">
          <div>
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-muted">BILL TO</div>
            <div className="leading-relaxed text-[#3A3934]">
              <div className="font-semibold text-ink">{inv.customerCompany || inv.customerName}</div>
              <div>{inv.customerName}</div>
              <div className="text-muted">{inv.customerEmail}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-2 self-start">
            <Meta k="Issued" v={fullDate(inv.issuedAt)} />
            <Meta k="Due" v={inv.dueDate ? fullDate(inv.dueDate) : "—"} />
            <Meta k="Terms" v={inv.terms} />
            {inv.poNumber ? <Meta k="PO number" v={inv.poNumber} /> : null}
            {inv.paidAt ? <Meta k="Paid" v={fullDate(inv.paidAt)} /> : null}
            {inv.amountPaid > 0 && inv.status !== "PAID" ? (
              <>
                <Meta k="Received" v={money(inv.amountPaid)} />
                <Meta k="Balance due" v={money(inv.balance)} />
              </>
            ) : null}
            {/* Per-box tracking renders in the SHIPMENT section below — the
                summary rows here only fill in when that detail is missing. */}
            {inv.fulfillmentStatus === "SHIPPED" && shipmentBoxes.length === 0 ? (
              <>
                <Meta k="Carrier" v={inv.carrier || "—"} />
                {trackingUrlFor(inv.carrier, inv.trackingNumber) ? (
                  <div>
                    <div className="micro-badge text-[9px] tracking-[0.12em] text-muted">Tracking</div>
                    <a
                      href={trackingUrlFor(inv.carrier, inv.trackingNumber)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block font-mono text-[12px] text-accent underline"
                    >
                      {inv.trackingNumber}
                    </a>
                  </div>
                ) : (
                  <Meta k="Tracking" v={inv.trackingNumber || "—"} />
                )}
              </>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-[1fr_120px_110px] border-b border-border pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Piece</span>
            <span>SKU</span>
            <span className="text-right">Wholesale</span>
          </div>
          {inv.items.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_120px_110px] items-center border-b border-border/60 py-3 text-[12.5px]"
            >
              <span className="text-ink">
                {l.title}{" "}
                <span className="ml-1 rounded border border-ink px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] text-ink">
                  1/1
                </span>
              </span>
              <span className="font-mono text-muted">{l.sku}</span>
              <span className="text-right font-mono text-ink">{money(l.price)}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto mt-6 w-64 text-[12.5px]">
          <Total k="Subtotal" v={money(inv.subtotal)} />
          <Total
            k={inv.shippingComp ? "Shipping — complimentary" : "Shipping"}
            v={inv.shippingComp ? "Free" : money(inv.shipping)}
          />
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-[13px] font-semibold text-ink">Invoice total</span>
            <span className="font-mono text-[22px] font-semibold text-ink">{money(inv.total)}</span>
          </div>
        </div>

        {shipmentBoxes.length > 0 ? (
          <div className="mt-8 border-t border-border pt-5">
            <ShipmentTracking boxes={shipmentBoxes} />
          </div>
        ) : null}

        <div className="mt-8 border-t border-border pt-5 text-[11px] text-muted">
          Payment terms: {inv.terms}. Wire instructions are on the downloadable PDF invoice.
          Every piece is one of one and insured in transit. Thank you for collecting with Luxe
          Supply Co.
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
