import type { z } from "zod";

/**
 * A refusal written for the person using the app ("This invoice was cancelled."). In a production build React hides the
 * message of an error thrown by a server action from the browser and sends only its digest, so the words travel there.
 * Throw this only with text that is safe to show; anything else stays hidden behind a plain "something went wrong".
 */
export class UserError extends Error {
  digest: string;
  constructor(message: string) {
    super(message);
    this.name = "UserError";
    this.digest = message;
  }
}

const GENERIC = "Something went wrong. Please try again, or tell whoever looks after the system.";

/** What to show when an action failed. A digest of digits is the framework's own fingerprint of an unexpected error. */
export function errorText(e: unknown): string {
  const err = e as { message?: unknown; digest?: unknown } | null | undefined;
  if (typeof err?.digest === "string" && err.digest && !/^\d+$/.test(err.digest)) return err.digest;
  const message = typeof err?.message === "string" ? err.message : "";
  // the message of a production error that was hidden from the browser
  if (!message || /Minified React error|Server Components render|omitted in production/.test(message)) return GENERIC;
  return message;
}

/** Checks input against a schema: the first problem is a plain sentence for the person, not a list of validation issues. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Check what you entered.");
  return r.data;
}
