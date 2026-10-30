import "server-only";
import { z } from "zod";
import { NOT_PUNCHED_IN } from "@/lib/auth/session";

/**
 * What every Prospecting action returns. Production builds hide the message of an error thrown by a server action (the
 * browser only sees React error #441), so problems the user can fix are returned instead of thrown.
 */
export type Result<T = undefined> = { error: string; value?: undefined } | { error?: undefined; value: T };

/** A problem the person can fix ("already in the list", "pick a reason"); its message is shown as it is. */
export class Problem extends Error {}

const SHOWN = new Set([NOT_PUNCHED_IN, "You do not have access to this"]);

/** Runs an action and turns expected problems into `{ error }`. Anything unexpected is logged and reported plainly. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { value: await fn() };
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Check the form and try again." };
    if (e instanceof Problem || (e instanceof Error && SHOWN.has(e.message))) return { error: e.message };
    console.error("[prospecting]", e);
    return { error: "Something went wrong and nothing was saved. Try again; if it keeps happening, tell an admin." };
  }
}
