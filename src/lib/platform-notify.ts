import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { publicBaseUrl } from "@/lib/invites";
import { sendPlatformMail } from "@/lib/platform-mail";

/**
 * Emails the platform's own people (new trial requests, unpaid and paused organisations): PLATFORM_NOTIFY_EMAIL (comma
 * separated), else every active platform admin, through app_platform_notify_emails() (the app's role cannot read the
 * platform admins). Nothing is sent without the platform mailbox.
 */
export async function notifyPlatform(subject: string, lines: string[], link = "/platform"): Promise<void> {
  let to = (process.env.PLATFORM_NOTIFY_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  if (!to.length) {
    const r = await db.execute<{ email: string }>(sql`SELECT app_platform_notify_emails() AS email`);
    to = r.rows.map((x) => x.email);
  }
  const base = await publicBaseUrl();
  for (const address of to) await sendPlatformMail({ to: address, subject: `[ZeronixOS platform] ${subject}`, lines, button: { label: "Open the platform console", url: `${base}${link}` } });
}
