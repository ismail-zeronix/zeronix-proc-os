"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { acceptInvite } from "@/lib/invites";
import { UserError } from "@/lib/user-error";

const schema = z.object({
  token: z.string().min(20).max(100),
  name: z.string().trim().min(2, "Enter your name").max(120),
  password: z.string().min(8, "Use at least 8 characters for the password").max(200),
  again: z.string(),
});

/** Joins the company from an invitation link and signs in. */
export async function joinWithInvite(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  if (d.password !== d.again) return { error: "The two passwords are not the same." };
  let user: Awaited<ReturnType<typeof acceptInvite>>;
  try {
    user = await acceptInvite(d.token, { name: d.name, password: d.password });
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[invite]", e);
    return { error: "Something went wrong. Please try again." };
  }
  await setSessionCookie({ id: user.id, name: user.name, email: user.email, role: user.role, sv: 1, org: user.orgId });
  redirect("/");
}
