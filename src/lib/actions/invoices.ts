"use server";

/**
 * Legacy barrel — do not import from `"use client"` components.
 * Soft-nav between rep pages double-registers webpack stubs when client
 * components share this module. Prefer thin files:
 * - generate-invoice.ts
 * - mark-invoice-paid.ts
 * - mark-invoice-shipped.ts
 */
export { generateInvoiceFromQuote } from "./generate-invoice";
export { markInvoicePaid } from "./mark-invoice-paid";
export { markInvoiceShippedAction } from "./mark-invoice-shipped";
