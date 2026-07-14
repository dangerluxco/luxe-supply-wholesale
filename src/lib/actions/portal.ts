"use server";

/**
 * Legacy barrel — do not import from `"use client"` components.
 * Soft-nav between rep pages double-registers webpack stubs when multiple
 * client components share this mega-module. Thin files in this folder are
 * the client-facing entrypoints.
 */
export { setQuoteStatus } from "./quote-status";
export { saveQuoteNotes } from "./quote-notes";
export { saveQuoteLineItems } from "./quote-line-items";
export { inviteBuyer } from "./invite-buyer";
export {
  setCatalogModeAction,
  buildCuratedCatalogDraft,
  saveCuratedCatalogAction,
} from "./catalog-settings";
