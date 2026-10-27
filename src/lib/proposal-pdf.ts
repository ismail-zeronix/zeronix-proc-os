import "server-only";
import { getBrand, getLogo } from "@/lib/brand";
import { printPageToPdf } from "@/lib/pdf";
import { displayCompany } from "@/lib/proposal";

/**
 * A proposal page as a PDF in Zeronix's layout: the cover edge to edge, then pages with the logo and the reference at
 * the top and the company address and page number at the bottom.
 */
export async function proposalPdf(path: string, session: string, reference: string): Promise<Buffer> {
  const [brand, logo] = await Promise.all([getBrand(), getLogo()]);
  return printPageToPdf(path, session, {
    cover: {
      headerRight: reference,
      footerLeft: [displayCompany(brand.company), brand.address].filter(Boolean).join(", "),
      logo: logo ? { mime: logo.mime, b64: logo.data.toString("base64") } : undefined,
    },
  });
}
