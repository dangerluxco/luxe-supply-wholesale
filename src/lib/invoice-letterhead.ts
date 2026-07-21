import {
  DEFAULT_INVOICE_FOOTER,
  formatPaymentInstructions,
  getCompanyProfile,
  getInvoicingProfile,
} from "@/lib/firestore/settings";
import type { InvoicePdfExtras, InvoicePdfLetterhead } from "@/lib/invoicePdf";

/** Load org letterhead + payment block + post-invoice extras for branded PDFs. */
export async function loadInvoicePdfOptions(): Promise<{
  paymentInstructions: string;
  letterhead: InvoicePdfLetterhead;
  extras: InvoicePdfExtras;
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
    extras: {
      invoiceNotes: invoicing.invoiceNotes,
      termsAndConditions: invoicing.termsAndConditions,
      footerMessage: invoicing.footerMessage || DEFAULT_INVOICE_FOOTER,
    },
  };
}
