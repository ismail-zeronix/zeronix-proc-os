"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadAccess } from "@/lib/auth/session";
import { answerCheckIn, checkInState } from "@/lib/check-in";
import { endOfDaySheet, saveReport, startOfDaySheet } from "@/lib/daily-report";
import { CHECKIN_DONE_KEYS } from "@/lib/routine";
import { parseInput, UserError } from "@/lib/user-error";

async function me() {
  const access = await loadAccess();
  if (!access) throw new UserError("Please sign in again");
  return access.user;
}

/** The punch-in sheet (null = not on the sales routine, nothing to show). */
export async function loadStartOfDay() {
  return startOfDaySheet((await me()).id);
}

/** The end-of-day sheet (null = not on the sales routine: punch out straight away). */
export async function loadEndOfDay() {
  return endOfDaySheet((await me()).id);
}

const reportSchema = z.object({
  note: z.string().trim().max(2000),
  behindReason: z.string().trim().max(500).default(""),
  move: z.boolean().default(true),
});

/** Sends today's report; punching out is the next step, done by the caller. */
export async function sendDailyReport(input: z.input<typeof reportSchema>) {
  const user = await me();
  const d = parseInput(reportSchema, input);
  const r = await saveReport(user.id, d);
  revalidatePath("/", "layout");
  return r;
}

/** The check-in prompt asks this on load, when the timer fires, and while its window is open. */
export async function loadCheckIn() {
  return checkInState((await me()).id);
}

const checkInSchema = z.object({
  done: z.array(z.enum(CHECKIN_DONE_KEYS)).max(CHECKIN_DONE_KEYS.length),
  note: z.string().trim().max(500),
});

export async function sendCheckIn(input: z.input<typeof checkInSchema>) {
  const user = await me();
  const d = parseInput(checkInSchema, input);
  const r = await answerCheckIn(user.id, d);
  return { ...r, next: await checkInState(user.id) };
}
