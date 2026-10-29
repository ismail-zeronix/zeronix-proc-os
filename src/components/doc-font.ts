import localFont from "next/font/local";

/**
 * The typeface of the customer documents (quotation, invoices, company profile): clean, wide and easy to read on paper.
 * Plus Jakarta Sans variable font (latin), bundled so the build never fetches Google Fonts; see app/fonts/OFL-LICENSE.txt.
 */
export const docFont = localFont({ src: "../app/fonts/PlusJakartaSans-latin-wght.woff2", weight: "200 800", display: "swap" });
