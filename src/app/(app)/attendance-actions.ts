"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { dubaiMinutes, isOffDay, needsReason } from "@/lib/attendance";
import { closeStaleSessions, workHours } from "@/lib/attendance-data";
import { loadAccess } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";

async function me() {
  const access = await loadAccess();
  if (!access) throw new Error("Please sign in again");
  return access.user;
}

const reason = z.string().trim().max(300).default("");

/** Starts a work session. After the start time (outside the break) a reason is required. */
export async function punchIn(input: { reason?: string }) {
  const user = await me();
  const text = reason.parse(input.reason);
  const hours = await workHours();
  const today = dubaiToday();
  await closeStaleSessions(user.id, hours, today);
  const [open] = await db
    .select({ id: schema.attendancePunches.id })
    .from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, user.id), isNull(schema.attendancePunches.outAt)));
  if (open) throw new Error("You are already punched in.");
  const late = needsReason("in", dubaiMinutes(), isOffDay(today, hours), hours);
  if (late && text.length < 3) throw new Error("Please give a reason for punching in late.");
  await db
    .insert(schema.attendancePunches)
    .values({ userId: user.id, day: today, inAt: new Date(), late, inReason: late ? text : "" });
  revalidatePath("/", "layout");
}

/** Ends the open session. Inside working hours (outside the break) a reason is required. */
export async function punchOut(input: { reason?: string }) {
  const user = await me();
  const text = reason.parse(input.reason);
  const hours = await workHours();
  const today = dubaiToday();
  await closeStaleSessions(user.id, hours, today);
  const [open] = await db
    .select({ id: schema.attendancePunches.id })
    .from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, user.id), isNull(schema.attendancePunches.outAt)))
    .orderBy(desc(schema.attendancePunches.inAt))
    .limit(1);
  if (!open) throw new Error("You are not punched in.");
  const early = needsReason("out", dubaiMinutes(), isOffDay(today, hours), hours);
  if (early && text.length < 3) throw new Error("Please give a reason for leaving during working hours.");
  await db
    .update(schema.attendancePunches)
    .set({ outAt: new Date(), early, outReason: early ? text : "" })
    .where(eq(schema.attendancePunches.id, open.id));
  revalidatePath("/", "layout");
}

const absenceSchema = z.object({
  userId: z.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["medical", "other"]),
  note: z.string().trim().max(300).default(""),
});

/** People record their own absences; admins can record anyone's. Up to 60 days ahead (planned leave). */
async function checkAbsenceAccess(userId: number, day: string) {
  const access = await loadAccess();
  if (!access) throw new Error("Please sign in again");
  if (access.user.id !== userId && access.user.role !== "admin") throw new Error("You can only change your own days.");
  const limit = new Date(Date.now() + 60 * 86400_000);
  if (day > dubaiToday(limit)) throw new Error("Pick a day within the next 60 days.");
  return access.user;
}

export async function setAbsence(input: z.input<typeof absenceSchema>) {
  const d = absenceSchema.parse(input);
  const by = await checkAbsenceAccess(d.userId, d.day);
  if (d.kind === "other" && d.note.length < 3) throw new Error("Please say what the reason was.");
  await db
    .insert(schema.attendanceAbsences)
    .values({ userId: d.userId, day: d.day, kind: d.kind, note: d.note, createdBy: by.id })
    .onConflictDoUpdate({
      target: [schema.attendanceAbsences.userId, schema.attendanceAbsences.day],
      set: { kind: d.kind, note: d.note, createdBy: by.id, createdAt: new Date() },
    });
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
}

export async function clearAbsence(input: { userId: number; day: string }) {
  const d = absenceSchema.pick({ userId: true, day: true }).parse(input);
  await checkAbsenceAccess(d.userId, d.day);
  await db
    .delete(schema.attendanceAbsences)
    .where(and(eq(schema.attendanceAbsences.userId, d.userId), eq(schema.attendanceAbsences.day, d.day)));
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
}
