"use server";

import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { normalizeName, normalizePhone } from "@/lib/parse/clean";
import { ingestMessage, learnHandles, pushedItemSchema, type IntakeResult } from "@/lib/procurement/intake";
import { SUPPLIER_TYPE_KEYS, supplierType } from "@/lib/supplier-types";
import { parseInput, UserError } from "@/lib/user-error";

const assignSchema = z.object({
  inboxId: z.number().int().positive(),
  supplierId: z.number().int().positive().optional(),
  newSupplierName: z.string().trim().max(120).optional(),
  newSupplierType: z.enum(SUPPLIER_TYPE_KEYS).default("other"),
});

/**
 * Says who an unknown sender is (an existing supplier, or a new one). Their number and name are remembered, and every
 * message waiting from the same sender is filed at once, so the next push from them goes straight in.
 */
export async function assignInboxMessage(input: z.input<typeof assignSchema>): Promise<{ supplier: string; results: IntakeResult[] }> {
  const user = await assertApp("procurement");
  const d = parseInput(assignSchema, input);
  const [row] = await db.select().from(schema.stockInbox).where(eq(schema.stockInbox.id, d.inboxId));
  if (!row) throw new UserError("This message was already filed.");

  let supplier: { id: number; name: string; defaultCurrency: string } | undefined;
  if (d.supplierId) {
    [supplier] = await db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name, defaultCurrency: schema.suppliers.defaultCurrency })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, d.supplierId));
    if (!supplier) throw new UserError("Supplier not found.");
  } else {
    const name = d.newSupplierName?.trim();
    if (!name || name.length < 2) throw new UserError("Choose a supplier or type the new supplier's name.");
    const [existing] = await db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name, defaultCurrency: schema.suppliers.defaultCurrency })
      .from(schema.suppliers)
      .where(sql`lower(${schema.suppliers.name}) = lower(${name})`);
    supplier =
      existing ??
      (
        await db
          .insert(schema.suppliers)
          .values({ name, type: d.newSupplierType, defaultCurrency: supplierType(d.newSupplierType).currency, phone: row.senderPhone })
          .returning({ id: schema.suppliers.id, name: schema.suppliers.name, defaultCurrency: schema.suppliers.defaultCurrency })
      )[0];
  }

  const sender = { sender_name: row.senderName, sender_phone: row.senderPhone };
  await learnHandles(supplier.id, sender);

  // every message waiting from this sender: same phone number, or same name when there is no number
  const phone = normalizePhone(row.senderPhone);
  const waiting = await db
    .select()
    .from(schema.stockInbox)
    .where(
      or(
        eq(schema.stockInbox.id, row.id),
        phone ? eq(schema.stockInbox.senderPhone, row.senderPhone) : undefined,
        !phone && normalizeName(row.senderName) ? and(eq(schema.stockInbox.senderPhone, ""), eq(schema.stockInbox.senderName, row.senderName)) : undefined,
      ),
    )
    .orderBy(schema.stockInbox.messageAt);

  const results: IntakeResult[] = [];
  for (const w of waiting) {
    const items = z.array(pushedItemSchema).safeParse(w.items);
    results.push(
      await ingestMessage(
        user.id,
        {
          chat: w.chat,
          sender_name: w.senderName,
          sender_phone: w.senderPhone,
          message_time: w.messageAt.toISOString(),
          message_text: w.messageText,
          price_basis: w.priceBasis,
          items: items.success ? items.data : [],
        },
        supplier,
      ),
    );
    await db.delete(schema.stockInbox).where(eq(schema.stockInbox.id, w.id));
  }
  revalidatePath("/procurement", "layout");
  return { supplier: supplier.name, results };
}

/** Not stock (a greeting, a wrong chat): throw the message away. */
export async function discardInboxMessage(id: number) {
  await assertApp("procurement");
  await db.delete(schema.stockInbox).where(eq(schema.stockInbox.id, parseInput(z.number().int().positive(), id)));
  revalidatePath("/procurement", "layout");
}
