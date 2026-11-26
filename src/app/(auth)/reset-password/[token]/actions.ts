"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { resetPassword } from "@/lib/auth/password-reset";
import { UserError } from "@/lib/user-error";

const schema = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(8, "Use at least 8 characters for the password").max(200),
  again: z.string(),
});

/** Sets the new password from a reset link, then sends the person to sign in with it. */
export async function setNewPassword(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  if (d.password !== d.again) return { error: "The two passwords are not the same." };
  try {
    await resetPassword(d.token, d.password);
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[reset]", e);
    return { error: "Something went wrong. Please try again." };
  }
  redirect("/login?reset=1");
}
