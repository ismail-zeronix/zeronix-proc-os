"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { parseLogoDataUrl } from "@/lib/logo";

const docSchema = z.object({
  docEmail: z.string().trim().max(200).default(""),
  docPhones: z.string().trim().max(200).default(""),
  tradeLicense: z.string().trim().max(60).default(""),
});

/** Each image: a data URL to replace it, "remove" to delete it, or leave out to keep it. */
type Image = string | undefined;

/** Contact lines and images printed on proposals and other customer documents. */
export async function saveDocumentBrand(input: z.input<typeof docSchema> & { logoDark?: Image; signature?: Image; stamp?: Image }) {
  await requireAdmin();
  const { logoDark, signature, stamp, ...rest } = input;
  const set: Partial<typeof schema.brandProfile.$inferInsert> = { ...docSchema.parse(rest), updatedAt: new Date() };
  const image = (v: Image, what: string, b64: "logoDarkB64" | "signatureB64" | "stampB64", mime: "logoDarkMime" | "signatureMime" | "stampMime") => {
    if (v === "remove") {
      set[b64] = "";
      set[mime] = "";
    } else if (v) {
      const p = parseLogoDataUrl(v, what);
      set[b64] = p.b64;
      set[mime] = p.mime;
    }
  };
  image(logoDark, "white logo", "logoDarkB64", "logoDarkMime");
  image(signature, "signature", "signatureB64", "signatureMime");
  image(stamp, "stamp", "stampB64", "stampMime");
  await db
    .insert(schema.brandProfile)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: schema.brandProfile.id, set });
  revalidatePath("/admin", "layout");
  revalidatePath("/projects", "layout");
}
