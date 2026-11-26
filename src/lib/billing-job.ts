import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { billingState, dayLabel, reminderFor, shouldPause, supportEmail } from "@/lib/billing";
import { publicBaseUrl } from "@/lib/invites";
import { notify } from "@/lib/notifications";
import { sendPlatformMail } from "@/lib/platform-mail";

/**
 * The billing job's work for one organisation (run inside runAsOrg by worker/billing.ts, so it reads and changes only
 * that organisation's own row): pause it when unpaid past the grace days, else send the reminder that is due. Admins
 * get each reminder in the bell and by email; the platform admins hear about unpaid and paused organisations.
 */
export async function checkBilling(today: string): Promise<"paused" | "reminded" | null> {
  const [org] = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      status: schema.organizations.status,
      plan: schema.organizations.plan,
      trialEndsOn: schema.organizations.trialEndsOn,
      paidUntil: schema.organizations.paidUntil,
      priceMonthly: schema.organizations.priceMonthly,
      billingReminder: schema.organizations.billingReminder,
    })
    .from(schema.organizations)
    .limit(1);
  if (!org || org.status !== "active") return null;
  const st = billingState(org, today);
  const admins = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.isActive, true)));
  const contact = supportEmail();
  const what = org.plan === "trial" ? "free trial" : "subscription";
  const price = org.priceMonthly ? ` The plan is AED ${org.priceMonthly.toLocaleString("en-US", { minimumFractionDigits: 2 })} a month before VAT.` : "";

  if (shouldPause(st)) {
    await db.update(schema.organizations).set({ status: "suspended", pausedReason: "unpaid", updatedAt: new Date() }).where(eq(schema.organizations.id, org.id));
    for (const a of admins) {
      await sendPlatformMail({
        to: a.email,
        subject: `${org.name}: ZeronixOS is paused`,
        lines: [
          `${org.name}'s ZeronixOS ${what} ended on ${dayLabel(st.endsOn!)} and was not renewed, so the account is now paused. Nobody can sign in until it is renewed.`,
          `Your data is kept. To continue, write to ${contact}.`,
        ],
      });
    }
    await notifyPlatform(`${org.name} was paused (unpaid)`, [`${org.name} (#${org.id}): ${what} ended ${dayLabel(st.endsOn!)}, unpaid past the grace days. It is paused now.`, "Recording a payment in the console reactivates it."]);
    return "paused";
  }

  const r = reminderFor(st, org.billingReminder);
  if (!r) return null;
  // saved first: a failing mailbox is not retried every hour
  await db.update(schema.organizations).set({ billingReminder: r.key }).where(eq(schema.organizations.id, org.id));
  const title =
    r.kind === "overdue"
      ? `Your ZeronixOS ${what} has ended: renew by ${dayLabel(st.pauseOn!)} to keep access`
      : `Your ZeronixOS ${what} ends on ${dayLabel(st.endsOn!)} (${st.daysLeft === 0 ? "today" : st.daysLeft === 1 ? "tomorrow" : `in ${st.daysLeft} days`})`;
  const lines =
    r.kind === "overdue"
      ? [`${org.name}'s ZeronixOS ${what} ended on ${dayLabel(st.endsOn!)}. Everything still works until ${dayLabel(st.pauseOn!)}, when the account is paused unless it is renewed.`, `To renew, write to ${contact}.${price}`]
      : [`${org.name}'s ZeronixOS ${what} ends on ${dayLabel(st.endsOn!)}.`, `To keep using it without a break, write to ${contact}.${price}`];
  await notify({ userIds: admins.map((a) => a.id), kind: "system", rule: "billing", priority: r.kind === "overdue" ? "high" : "normal", title, body: lines.join(" "), link: "/admin", key: `billing:${r.key}` });
  const base = await publicBaseUrl();
  for (const a of admins) await sendPlatformMail({ to: a.email, subject: title, lines: [`Hello ${a.name.trim().split(/\s+/)[0] || ""},`.replace(" ,", ","), ...lines], button: { label: "Open ZeronixOS", url: `${base}/admin` } });
  if (r.kind === "overdue") await notifyPlatform(`${org.name}: unpaid since ${dayLabel(st.endsOn!)}`, [`${org.name} (#${org.id}): ${what} ended ${dayLabel(st.endsOn!)}. It pauses on ${dayLabel(st.pauseOn!)} unless a payment is recorded.`]);
  return "reminded";
}

/** Emails the platform's own people: PLATFORM_NOTIFY_EMAIL (comma separated), else every active platform admin. */
export async function notifyPlatform(subject: string, lines: string[]): Promise<void> {
  let to = (process.env.PLATFORM_NOTIFY_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  if (!to.length) {
    const r = await db.execute<{ email: string }>(sql`SELECT app_platform_notify_emails() AS email`);
    to = r.rows.map((x) => x.email);
  }
  const base = await publicBaseUrl();
  for (const address of to) await sendPlatformMail({ to: address, subject: `[ZeronixOS platform] ${subject}`, lines, button: { label: "Open the platform console", url: `${base}/platform` } });
}
