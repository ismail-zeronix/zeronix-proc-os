export const LOGO_MAX_BYTES = 400 * 1024;

const MAGIC: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

/**
 * Checks an uploaded logo given as a data URL: PNG, JPG or WebP only, under 400 KB, and the file header must match
 * the type it claims (an .svg or a renamed file is rejected, since mail programs do not show them reliably).
 */
export function parseLogoDataUrl(dataUrl: string): { mime: string; b64: string } {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("The logo must be a PNG, JPG or WebP image.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > LOGO_MAX_BYTES) throw new Error("The logo is over 400 KB. Use a smaller image (about 300 px wide is enough).");
  if (!MAGIC[m[1]].every((b, i) => bytes[i] === b)) {
    throw new Error("That file is not really a " + m[1].replace("image/", "").toUpperCase() + " image.");
  }
  return { mime: m[1], b64: m[2] };
}
