import type { NewsBrand } from "./types";
import { DEFAULT_STYLE } from "./blocks";

/** The instructions to give an AI tool (or a designer) so the code it makes works here: same size, safe layout, the right merge tags, no invented claims. */
export function buildPrompt(brand: NewsBrand, topic: string, audience: string): string {
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join(" | ");
  return `You are a senior email developer and designer. Create ONE complete HTML marketing newsletter for ${brand.company || "our company"}, a business technology supplier and installer in the UAE (computers, CCTV and security, networking and Wi-Fi, meeting-room AV, websites and software).

SUBJECT OF THIS NEWSLETTER:
${topic.trim() || "[describe the offer, product group or message here]"}

AUDIENCE:
${audience.trim() || "Owners and office managers of small and medium businesses in the UAE"}

TONE: professional, clear and confident. Short sentences. No hype and no slang.

DESIGN (corporate, clean, modern):
- Brand colours: dark navy ${DEFAULT_STYLE.brand} for the header, banner and footer, with mint ${DEFAULT_STYLE.accent} as the accent for buttons and highlights. Buttons have dark navy text on mint. Page background ${DEFAULT_STYLE.page}, content area white.
- Structure: logo/name bar, banner with a small label, a strong headline, one line of support text and a button; then 2 to 4 short sections (for example a numbered list of benefits, a row of 3 key points, a product or service block); then a call-to-action band and the footer.
- Plenty of white space, one idea per section, one main button.

TECHNICAL RULES (all of these are required):
- One complete HTML document starting with <!doctype html>, 600 px wide and centred, built with nested tables (role="presentation").
- ALL styling inline. The only <style> block allowed is a small @media (max-width:620px) rule that makes columns stack and padding smaller.
- It must render correctly in Outlook (Windows), Gmail, Apple Mail and on phones. No JavaScript, no forms, no video, no CSS grid or flexbox, no background images, no web fonts. Use only Arial, Helvetica, Georgia or Verdana font stacks.
- Buttons must be "bulletproof": a table cell with the background colour and a link inside it with padding.
- Every image: an absolute https:// address, a width attribute, alt text, and style="display:block;border:0". If a real picture address is not known, use https://placehold.co/600x300 as a placeholder.
- Add a hidden preheader line (short preview text) at the very top of the body.
- Merge tags to use exactly as written: {name} for the reader's first name (for example "Hello {name},") and {unsubscribe_url} as the link address of an "Unsubscribe" link in the footer.
- Footer: ${brand.company || "company name"}${brand.address ? `, ${brand.address}` : ""}${contact ? `, ${contact}` : ""}, one line saying why the person is receiving the email, and the Unsubscribe link.

CONTENT RULES:
- Do not invent prices, discounts, stock levels, delivery times, warranties, awards, customer names or statistics. If a figure is needed, leave a clear [PLACEHOLDER] for me to fill in.
- Link buttons to ${brand.website ? `https://${brand.website.replace(/^https?:\/\//, "")}` : "[WEBSITE ADDRESS]"} or to [LINK] placeholders.

OUTPUT: only the complete HTML code in a single code block. No explanation before or after.`;
}

