"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { pickedIds, recipientsFor, sendingCapacity, UNSORTED } from "@/lib/prospecting/campaign-builder";
import { enroll } from "@/lib/prospecting/outreach";
import { addWorkingDays } from "@/lib/prospecting/outreach-rules";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { writeEmail, writeInputFor } from "@/lib/prospecting/writer";
import { FALLBACK_FIRST, FOLLOW_UPS } from "@/lib/prospecting/writer-rules";
import { parseInput } from "@/lib/user-error";

const pickSchema = z.object({
  industry: z.string().trim().min(1).max(80),
  take: z.number().int().min(0).max(500),
  onlyReady: z.boolean(),
});
export type PickInput = z.input<typeof pickSchema>;

/** The prospects a choice covers, with who each would be emailed at. */
export async function previewPick(input: PickInput): Promise<Result<{ count: number; rows: Awaited<ReturnType<typeof recipientsFor>> }>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const ids = await pickedIds(pickSchema.parse(input));
    return { count: ids.length, rows: await recipientsFor(ids.slice(0, 6)) };
  });
}

/** What we offer, plus the tone notes given in the chat, as one brief for AI. The first line is the offer. */
const briefOf = (offer: string, notes: string[]) => [offer.trim(), ...notes.map((n) => `- ${n.trim()}`)].join("\n");

const sampleSchema = pickSchema.extend({
  offer: z.string().trim().min(3, "Say in a few words what we offer them").max(400),
  notes: z.array(z.string().trim().max(300)).max(10).default([]),
  /** Which of the picked prospects to write to (0 = the best one), to see another example. */
  index: z.number().int().min(0).max(50).default(0),
});
export type SampleInput = z.input<typeof sampleSchema>;

export interface Sample {
  company: string;
  companyId: number;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  model: string;
}

/** Writes one real example email with AI (not saved), so people can see and adjust the style before launching. */
export async function sampleEmail(input: SampleInput): Promise<Result<Sample>> {
  return attempt(async () => {
    await assertApp("prospecting");
    const d = parseInput(sampleSchema, input);
    const ids = await pickedIds(d, d.index + 1);
    const id = ids[Math.min(d.index, ids.length - 1)];
    if (!id) throw new Problem("No prospect matches this choice any more.");
    const [r] = await recipientsFor([id]);
    const w = await writeInputFor(id, r.personId, briefOf(d.offer, d.notes));
    if (!w) throw new Problem("That prospect no longer exists.");
    const out = await writeEmail(w);
    if ("error" in out) throw new Problem(out.waiting ? `AI is out of today's allowance (${out.error}). The campaign can still be launched; emails are written when it comes back.` : `AI could not write the example: ${out.error}`);
    return { company: r.name, companyId: id, to: r.to, cc: r.cc, subject: out.email.subject, body: out.email.body, model: out.model };
  });
}

const launchSchema = sampleSchema.extend({
  followUps: z.number().int().min(0).max(FOLLOW_UPS.length),
  /** "now", "tomorrow" or a yyyy-mm-dd day. */
  start: z.string().regex(/^(now|tomorrow|\d{4}-\d{2}-\d{2})$/, "Pick when to start"),
  review: z.boolean(),
});
export type LaunchInput = z.input<typeof launchSchema>;

/**
 * Creates the campaign from the chat: its sequence (AI first email plus the chosen follow-ups), the campaign itself and
 * every picked prospect with To and Cc filled in. AI then writes each first email in the background.
 */
export async function launchCampaign(input: LaunchInput): Promise<Result<{ campaignId: number; added: number; skipped: { name: string; reason: string }[] }>> {
  return attempt(async () => {
    const me = await assertApp("prospecting");
    const d = parseInput(launchSchema, input);
    const ids = await pickedIds(d);
    if (!ids.length) throw new Problem("No prospect matches this choice any more.");
    const cap = await sendingCapacity();
    const today = dubaiToday();
    const day = d.start === "now" ? null : d.start === "tomorrow" ? addWorkingDays(today, 1) : d.start;
    if (day && day < today) throw new Problem("Pick a day from today on.");
    const startAt = day ? new Date(`${day}T${cap.windowStart}:00+04:00`) : null;
    const label = d.industry === UNSORTED ? "Mixed" : d.industry;
    const name = `${label}: ${d.offer.split("\n")[0].slice(0, 60)}`;

    const { campaignId } = await db.transaction(async (tx) => {
      const [seq] = await tx.insert(schema.outreachSequences).values({ name: `${name} (AI first email)` }).returning({ id: schema.outreachSequences.id });
      await tx.insert(schema.outreachSequenceSteps).values([
        { sequenceId: seq.id, position: 1, delayDays: 0, subject: "{company}: a quick question", body: FALLBACK_FIRST },
        ...FOLLOW_UPS.slice(0, d.followUps).map((f, i) => ({ sequenceId: seq.id, position: i + 2, delayDays: f.delayDays, subject: "", body: f.body })),
      ]);
      const [c] = await tx
        .insert(schema.outreachCampaigns)
        .values({ name, sequenceId: seq.id, ownerId: me.id, brief: briefOf(d.offer, d.notes), industry: d.industry === UNSORTED ? "" : d.industry, review: d.review, startAt, status: "active" })
        .returning({ id: schema.outreachCampaigns.id });
      return { campaignId: c.id };
    });
    const res = await enroll(campaignId, ids, me.id);
    if (!res.added) {
      // nothing could be added: leave no empty campaign behind
      const [c] = await db.delete(schema.outreachCampaigns).where(eq(schema.outreachCampaigns.id, campaignId)).returning({ sequenceId: schema.outreachCampaigns.sequenceId });
      if (c) await db.delete(schema.outreachSequences).where(eq(schema.outreachSequences.id, c.sequenceId));
      throw new Problem(`None of them could be added: ${[...new Set(res.skipped.map((s) => s.reason))].slice(0, 3).join("; ")}.`);
    }
    revalidatePath("/prospecting", "layout");
    return { campaignId, added: res.added, skipped: res.skipped };
  });
}
