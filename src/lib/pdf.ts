import "server-only";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer-core";
import { SESSION_COOKIE } from "@/lib/auth/token";

/**
 * Turns one of our own print pages (/print/...) into a PDF with headless Chromium, so the file looks exactly like
 * "Print / PDF". The browser is started for each file and closed straight after (no memory kept between sends), and
 * only one runs at a time.
 */

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

function browserPath(): string {
  const found = CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error("No browser found to make the PDF. Set CHROMIUM_PATH on the server.");
  return found;
}

/** Where this server answers itself: inside Docker that is port 3000; set INTERNAL_URL when it runs elsewhere. */
export const internalUrl = () => (process.env.INTERNAL_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

let queue: Promise<unknown> = Promise.resolve();

/**
 * A document with a full-page cover and running header / footer on the pages after it (proposals). The cover and the
 * body are printed separately and joined, so the cover has no margins and "Page 1" is the first page after it.
 */
export interface CoverLayout {
  /** Right side of the running header, e.g. "Quotation No. ZQ-2026-0006". */
  headerRight: string;
  /** Left side of the footer, e.g. "Zeronix Technology LLC, Office 19, ... Bur Dubai, UAE". */
  footerLeft: string;
  /** The logo for the running header (it must be inline: the header cannot load files). */
  logo?: { mime: string; b64: string };
}

/**
 * @param path  a /print/... page.  @param session  the signed-in user's session cookie, so the page opens as them.
 * @param opts.footer  a simple footer with page numbers on every page.  @param opts.cover  the proposal layout (see CoverLayout).
 */
export function printPageToPdf(path: string, session: string, opts: { footer?: string; cover?: CoverLayout } = {}): Promise<Buffer> {
  if (!/^\/print\/[a-z]+\/\d+$/.test(path)) throw new Error("Only print pages can be turned into a PDF.");
  const run = queue.then(() => render(path, session, opts));
  queue = run.catch(() => {});
  return run;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeMime = (m: string) => (/^image\/(png|jpeg|webp)$/.test(m) ? m : "image/png");

/** The proposal body pages: logo and reference at the top, address and page number at the bottom (Chromium fills in pageNumber). */
function coverTemplates(c: CoverLayout) {
  const font = "font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact";
  const logo = c.logo ? `<img src="data:${safeMime(c.logo.mime)};base64,${c.logo.b64}" style="height:7mm;width:auto">` : "<span></span>";
  return {
    headerTemplate: `<div style="${font};width:100%;margin:0 14mm;padding-bottom:2mm;border-bottom:0.6px solid #bbb;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#555">${logo}<span>${escapeHtml(c.headerRight)}</span></div>`,
    footerTemplate: `<div style="${font};width:100%;margin:0 14mm;padding-top:2mm;border-top:0.6px solid #bbb;display:flex;justify-content:space-between;font-size:8px;color:#666"><span>${escapeHtml(c.footerLeft)}</span><span>Page <span class="pageNumber"></span></span></div>`,
  };
}

async function render(path: string, session: string, opts: { footer?: string; cover?: CoverLayout }): Promise<Buffer> {
  const { footer, cover } = opts;
  const base = internalUrl();
  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--disable-extensions"],
  });
  try {
    const page = await browser.newPage();
    const { hostname } = new URL(base);
    await page.setCookie({ name: SESSION_COOKIE, value: session, domain: hostname, path: "/", httpOnly: true });
    const res = await page.goto(base + path, { waitUntil: "networkidle0", timeout: 30_000 });
    // a redirect to /login means the session was not accepted
    if (!res?.ok() || new URL(page.url()).pathname !== path) throw new Error(`Could not open the document to make the PDF (${res?.status() ?? "no answer"}).`);
    await page.emulateMediaType("print");
    if (cover && (await page.$("[data-pdf-cover]"))) {
      // 1) the cover alone, edge to edge  2) everything after it with margins, header and footer  3) joined
      await page.evaluate(() => {
        document.documentElement.dataset.pdf = "cover";
      });
      const first = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, pageRanges: "1" });
      // the body's first page must not take the cover's zero margin: replace the page's own page rules
      await page.evaluate(() => {
        document.documentElement.dataset.pdf = "body";
        document.querySelectorAll("style[data-page-css]").forEach((s) => s.remove());
      });
      await page.addStyleTag({ content: "@page{size:A4;margin:22mm 14mm 18mm}@page:first{margin:22mm 14mm 18mm}html[data-pdf=body] [data-pdf-cover]{display:none!important}" });
      const t = coverTemplates(cover);
      const body = { format: "A4" as const, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true };
      // the first inside page carries the full quotation header already, so only the footer there (as on Zeronix's own)
      const opening = await page.pdf({ ...body, pageRanges: "1", headerTemplate: "<span></span>", footerTemplate: t.footerTemplate });
      // the rest: logo and reference at the top; a one-page body has no rest, which Chromium reports as an error
      const rest = await page.pdf({ ...body, pageRanges: "2-", ...t }).catch(() => null);
      const out = await PDFDocument.create();
      for (const part of [first, opening, ...(rest ? [rest] : [])]) {
        const doc = await PDFDocument.load(part);
        for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p);
      }
      return Buffer.from(await out.save());
    }
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      // Chromium draws this in the bottom page margin and fills in pageNumber / totalPages itself
      ...(footer
        ? {
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: `<div style="width:100%;font-size:8px;color:#777;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${escapeHtml(footer)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
          }
        : {}),
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
