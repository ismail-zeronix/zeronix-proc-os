"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/fx";
import { SUPPLIER_TYPE_KEYS } from "@/lib/supplier-types";

const supplierSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(60).default(""),
  location: z.string().trim().max(120).default(""),
  type: z.enum(SUPPLIER_TYPE_KEYS).default("other"),
  defaultCurrency: z.enum(CURRENCIES).default("AED"),
  notes: z.string().trim().max(2000).default(""),
  isActive: z.boolean().default(true),
});

export async function saveSupplier(input: z.input<typeof supplierSchema>) {
  await requireUser();
  const { id, ...data } = supplierSchema.parse(input);
  try {
    if (id) await db.update(schema.suppliers).set(data).where(eq(schema.suppliers.id, id));
    else await db.insert(schema.suppliers).values(data);
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === "23505") {
      throw new Error("A supplier with this name already exists.");
    }
    throw e;
  }
  revalidatePath("/suppliers");
}
