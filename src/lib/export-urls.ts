/** Which downloads go through the background queue, and how they rank. No database, so it is easy to test. */

const ALLOWED: readonly RegExp[] = [
  /^\/api\/reports\/pdf(\?[\w=&%.+~-]*)?$/,
  /^\/api\/reports(\?[\w=&%.+~-]*)?$/,
  /^\/api\/accounts\/export(\?[\w=&%.,+~-]*)?$/,
  /^\/api\/accounts\/vat\/faf(\?[\w=&%.+~-]*)?$/,
  /^\/api\/documents\/[a-z-]+\/\d+\/pdf(\?[\w=&%.+~-]*)?$/,
  /^\/api\/quotes\/\d+\/pdf$/,
  /^\/api\/projects\/proposals\/\d+\/pdf(\?[\w=&%.+~-]*)?$/,
  /^\/api\/export(\?[\w=&%.,+~-]*)?$/,
];

/** Only our own download addresses: the worker opens this as the person who asked, so it must never be anything else. */
export const isExportUrl = (url: unknown): url is string => typeof url === "string" && url.length <= 4000 && ALLOWED.some((r) => r.test(url));

/** Lower goes first. One document takes seconds, so it does not wait behind a year of the general ledger. */
export const exportPriority = (url: string): number => (/^\/api\/(documents|quotes|projects)\//.test(url) ? 1 : /^\/api\/accounts\/export/.test(url) ? 3 : 5);

/** The name in a Content-Disposition header (the plain one, or the UTF-8 one when both are there). */
export function fileNameOf(header: string | null, fallback = "download"): string {
  const utf = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf) {
    try {
      return decodeURIComponent(utf);
    } catch {
      /* fall through to the plain name */
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

/** The file's extension in our store, from what it is. */
export const extensionOf = (contentType: string | null, name: string): string => {
  if (contentType?.includes("pdf")) return "pdf";
  if (contentType?.includes("spreadsheetml")) return "xlsx";
  if (contentType?.includes("csv")) return "csv";
  return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? "bin";
};
