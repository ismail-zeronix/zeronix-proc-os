"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { zeronixFeatures } from "@/lib/edition";
import { ipFromHeaders } from "@/lib/client-ip";
import { submitTrialRequest, TEAM_SIZES } from "@/lib/trial-requests";
import { allow } from "@/lib/webchat/public";

const schema = z.object({
  company: z.string().trim().min(2, "Enter your company's name").max(160),
  contactName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter your work email").max(200),
  phone: z.string().trim().max(40).default(""),
  teamSize: z.enum(TEAM_SIZES).or(z.literal("")).default(""),
  message: z.string().trim().max(600).default(""),
  agree: z.literal("on", { message: "Please accept the terms and the privacy notice" }),
  // a field people never see: a form that fills it in is a bot
  website: z.string().max(0).optional(),
});

/** "Request a free trial" (SaaS sign-in page): saved for the platform console to approve. */
export async function requestTrial(_prev: { error?: string; done?: string } | undefined, form: FormData): Promise<{ error?: string; done?: string }> {
  if (zeronixFeatures()) return { error: "Not available here." };
  const raw = Object.fromEntries(form);
  if (typeof raw.website === "string" && raw.website.length > 0) return { done: String(raw.email ?? "") };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ip = ipFromHeaders(await headers());
  if (!allow(`trial:${ip || "local"}`, 5, 3600_000)) return { error: "Too many requests from your network. Please try again in an hour." };
  const d = parsed.data;
  try {
    await submitTrialRequest({ company: d.company, contactName: d.contactName, email: d.email, phone: d.phone, teamSize: d.teamSize, message: d.message }, ip);
  } catch (e) {
    console.error("[trial] request failed", e);
    return { error: "Something went wrong. Please try again, or write to us." };
  }
  return { done: d.email };
}
