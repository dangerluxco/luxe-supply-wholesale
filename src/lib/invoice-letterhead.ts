import {
  formatPaymentInstructions,
  getCompanyProfile,
  getInvoicingProfile,
} from "@/lib/firestore/settings";
import type { InvoicePdfLetterhead } from "@/lib/invoicePdf";

/** Load org letterhead + payment block for branded invoice PDFs. */
export async function loadInvoicePdfOptions(): Promise<{
  paymentInstructions: string;
  letterhead: InvoicePdfLetterhead;
}> {
  const [company, invoicing] = await Promise.all([getCompanyProfile(), getInvoicingProfile()]);
  const addressBits = [
    invoicing.addressLine1,
    invoicing.addressLine2,
    [invoicing.city, invoicing.state, invoicing.postalCode].filter(Boolean).join(", "),
    invoicing.country,
  ].filter(Boolean);
  const tagline = [invoicing.legalName || company.displayName, ...addressBits.slice(0, 2)]
    .filter(Boolean)
    .join("  ·  ")
    .toUpperCase();

  return {
    paymentInstructions: formatPaymentInstructions(invoicing),
    letterhead: {
      brandName: company.displayName || "Luxe Supply",
      legalName: invoicing.legalName || "Luxe Supply Corporation",
      tagline,
      taxId: invoicing.taxId || undefined,
    },
  };
}
