import { requireStaffSession } from "@/lib/staff-api-auth";
import { getInvoiceById, displayInvoiceStatus } from "@/lib/firestore/invoices";
import { getPaymentInstructions } from "@/lib/firestore/settings";
import { renderInvoicePdf } from "@/lib/invoicePdf";

export const dynamic = "force-dynamic";

/** Branded invoice PDF (staff console) — `?disposition=inline` renders in the
 * browser tab (View invoice); default downloads as an attachment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const inv = await getInvoiceById(id);
  if (!inv) return new Response("Not found", { status: 404 });

  const paymentInstructions = await getPaymentInstructions().catch(() => "");
  const pdf = await renderInvoicePdf(inv, {
    statusLabel: displayInvoiceStatus(inv),
    paymentInstructions,
  });

  const inline = new URL(req.url).searchParams.get("disposition") === "inline";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${inv.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
