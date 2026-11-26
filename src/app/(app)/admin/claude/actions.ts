"use server";

import { assertZeronixFeatures } from "@/lib/edition";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { revokeConnection } from "@/lib/mcp/oauth";
import { parseInput, UserError } from "@/lib/user-error";

/** Disconnects one Claude connection: its tokens stop working at once and Claude asks to sign in again. */
export async function revokeClaude(id: number) {
  assertZeronixFeatures(); // Zeronix's own feature (lib/edition.ts)
  const me = await requireAdmin();
  const grantId = parseInput(z.number().int().positive(), id);
  const g = await revokeConnection(grantId);
  if (!g) throw new UserError("That connection was already disconnected.");
  await audit(db, { userId: me.id, action: "claude.revoke", entity: "mcp_grant", entityId: grantId, summary: `Disconnected a Claude connection of user ${g.userId}` });
  revalidatePath("/admin/claude");
}
