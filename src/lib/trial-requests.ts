import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sendPlatformMail } from "@/lib/platform-mail";
import { notifyPlatform } from "@/lib/platform-notify";

/** The team sizes the form offers. */
export const TEAM_SIZES = ["1-5", "6-20", "21-50", "51+"] as const;

export interface TrialRequestInput {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  teamSize: string;
  message: string;
}

/**
 * Saves a "Request a free trial" form through app_trial_request() (the app's role has no rights on trial_requests),
 * then thanks the person by email and tells the platform. The same email again within a week is the same request:
 * nothing more is saved or sent. The platform console approves it into an organisation.
 */
export async function submitTrialRequest(input: TrialRequestInput, ip: string): Promise<{ id: number; isNew: boolean }> {
  const r = await db.execute<{ id: number; is_new: boolean }>(
    sql`SELECT * FROM app_trial_request(${input.company}, ${input.contactName}, ${input.email}, ${input.phone}, ${input.teamSize}, ${input.message}, ${ip})`,
  );
  const row = r.rows[0];
  if (row?.is_new) {
    const first = input.contactName.trim().split(/\s+/)[0];
    await sendPlatformMail({
      to: input.email,
      subject: "Your ZeronixOS trial request",
      lines: [
        first ? `Hello ${first},` : "Hello,",
        `Thank you for asking to try ZeronixOS for ${input.company}.`,
        "We will be in touch within one working day with a link to set up your account. The trial is free, with no card needed.",
      ],
      note: "If you did not ask for this, you can ignore this email.",
    });
    await notifyPlatform(
      `New trial request: ${input.company}`,
      [
        `${input.company}: ${input.contactName} <${input.email}>${input.phone ? `, ${input.phone}` : ""}${input.teamSize ? `, team of ${input.teamSize}` : ""}.`,
        ...(input.message ? [`They wrote: ${input.message}`] : []),
        "Review it in the platform console: approve to create the company and email its invitation.",
      ],
      "/platform",
    );
  }
  return { id: Number(row?.id ?? 0), isNew: !!row?.is_new };
}
