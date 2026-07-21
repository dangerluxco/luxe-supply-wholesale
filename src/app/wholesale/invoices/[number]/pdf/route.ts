import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { getInvoiceByNumber, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { loadInvoicePdfOptions } from "@/lib/invoice-letterhead";
import { renderInvoicePdf } from "@/lib/invoicePdf";

export const dynamic = "force-dynamic";

/** Branded invoice PDF download (buyer) — same auth rules as the CSV route. */
export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) return new Response("Unauthorized", { status: 401 });

  const inv = await getInvoiceByNumber(decodeURIComponent(number));
  if (!inv || inv.portalUsername !== session.username) {
    return new Response("Not found", { status: 404 });
  }

  const letter = await loadInvoicePdfOptions().catch(() => ({
    paymentInstructions: "",
    letterhead: null,
    extras: null,
  }));
  const pdf = await renderInvoicePdf(inv, {
    statusLabel: displayInvoiceStatus(inv),
    paymentInstructions: letter.paymentInstructions,
    letterhead: letter.letterhead,
    extras: letter.extras,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${inv.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
