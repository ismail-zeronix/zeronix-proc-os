/** Folders of the Files app (pure, safe in the browser). */
export const FOLDERS = [
  { key: "lpo", label: "Customer POs / LPOs" },
  { key: "delivery", label: "Signed delivery notes" },
  { key: "invoices", label: "Invoices and receipts" },
  { key: "suppliers", label: "Supplier documents" },
  { key: "company", label: "Company documents" },
  { key: "other", label: "Other" },
] as const;
export type FolderKey = (typeof FOLDERS)[number]["key"];
export const isFolder = (k: string): k is FolderKey => FOLDERS.some((f) => f.key === k);
export const folderLabel = (k: string) => FOLDERS.find((f) => f.key === k)?.label ?? "Other";

/** What a file can be linked to, so it also shows on that page. */
export const RELATED_TYPES = ["company", "deal", "order", "invoice"] as const;
export type RelatedType = (typeof RELATED_TYPES)[number];
export const isRelatedType = (k: string): k is RelatedType => (RELATED_TYPES as readonly string[]).includes(k);

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** File types people may upload, by extension, with the type the browser is told when downloading. */
export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Shown inline in the browser (preview) rather than downloaded. */
export const INLINE_EXT = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "txt"]);

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
