"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { ipFromHeaders } from "@/lib/client-ip";
import { platformMailReady } from "@/lib/platform-mail";
import { allow } from "@/lib/webchat/public";

/**
 * "Forgot password?": emails a link when the address has an account, and answers the same when it has not, so nobody
 * can learn which emails are registered. One network may ask 10 times an hour.
 */
export async function askReset(_prev: { error?: string; sentTo?: string } | undefined, form: FormData): Promise<{ error?: string; sentTo?: string }> {
  const email = z.string().trim().toLowerCase().email().max(200).safeParse(form.get("email"));
  if (!email.success) return { error: "Enter your email address." };
  if (!platformMailReady()) return { error: "Email is not set up here yet. Ask your company's admin to set a new password for you." };
  const ip = ipFromHeaders(await headers());
  if (!allow(`reset:${ip || "local"}`, 10, 3600_000)) return { error: "Too many requests from your network. Please try again in an hour." };
  try {
    await requestPasswordReset(email.data, ip);
  } catch (e) {
    // the answer stays the same; the details go to the server log
    console.error("[reset] request failed", e);
  }
  return { sentTo: email.data };
}
