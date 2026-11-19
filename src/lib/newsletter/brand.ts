import "server-only";
import { getBrand, getBrandAsset, getDocBrand } from "@/lib/brand";
import type { NewsBrand } from "./types";

/**
 * The company details in the email header and footer, from Admin's brand: the white logo (made for dark backgrounds, like
 * the navy header) when one is uploaded, else the company name in text. `logo` is the file to attach to a sent mail
 * (cid:zeronix-news-logo); `previewSrc` is the same logo as a data address, because a preview frame has no login cookie to fetch it with.
 */
export const NEWS_LOGO_CID = "zeronix-news-logo";

export async function newsBrand(): Promise<{ brand: NewsBrand; previewSrc: string; logo: { mime: string; data: Buffer } | null }> {
  const [b, doc, logo] = await Promise.all([getBrand(), getDocBrand(), getBrandAsset("logo-dark")]);
  const first = (s: string) => s.split(/[,;\n]/)[0]?.trim() ?? "";
  return {
    brand: {
      company: b.company,
      address: b.address,
      website: b.website,
      phone: b.mainPhone || first(doc.phones),
      email: first(doc.email),
    },
    previewSrc: logo ? `data:${logo.mime};base64,${logo.data.toString("base64")}` : "",
    logo,
  };
}
