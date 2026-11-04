import "server-only";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { mailServer } from "@/lib/mail/config";
import { getSetting } from "@/lib/settings";
import { notify } from "./index";
import { dueText, PRIORITY_LABEL, PRIORITY_RANK, type Priority } from "./types";

/**
 * The morning emails, once a working day at the start of work:
 * - every person with open alerts gets "Your day" (critical and high first, everything linked to the portal);
 * - every admin gets the "Team summary": open critical and high alerts per person (the escalation the owner chose
 *   instead of live alerts to admins), as an email and as a line in their bell.
 * Emails go from the mailbox picked in Admin › Settings › Notifications; with none picked only the bell line is made.
 */

const n = schema.notifications;
const portal = () => (process.env.PORTAL_URL || "https://zeronixos.online").replace(/\/$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COLOR: Record<Priority, string> = { critical: "#dc2626", high: "#ea580c", normal: "#0284c7", info: "#6b7280" };

interface OpenLine {
  userId: number;
  priority: Priority;
  title: string;
  body: string;
  link: string;
  dueAt: Date | null;
}

async function openLines(): Promise<OpenLine[]> {
  const now = new Date();
  const rows = await db
    .select({ userId: n.userId, priority: n.priority, title: n.title, body: n.body, link: n.link, dueAt: n.dueAt })
    .from(n)
    .innerJoin(schema.users, eq(schema.users.id, n.userId))
    .where(and(isNull(n.resolvedAt), inArray(n.kind, ["system", "assign"]), or(isNull(n.snoozedUntil), lte(n.snoozedUntil, now)), eq(schema.users.isActive, true)))
    .orderBy(asc(n.createdAt));
  return rows.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

function lineHtml(l: OpenLine, who?: string): string {
  const due = l.dueAt ? dueText(l.dueAt.toISOString()) : "";
  const sub = [who, due, l.body].filter(Boolean).map((s) => esc(String(s))).join(" · ");
  return `<tr><td style="padding:6px 0;vertical-align:top"><span style="display:inline-block;min-width:58px;font-size:11px;font-weight:bold;color:${COLOR[l.priority]}">${PRIORITY_LABEL[l.priority].toUpperCase()}</span></td>
<td style="padding:6px 0"><a href="${portal()}${esc(l.link || "/notifications")}" style="color:#111827;font-weight:bold;text-decoration:none">${esc(l.title)}</a>${sub ? `<div style="color:#6b7280;font-size:12px">${sub}</div>` : ""}</td></tr>`;
}

function page(heading: string, intro: string, rows: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;max-width:640px">
<h2 style="font-size:18px;margin:0 0 4px">${esc(heading)}</h2><p style="color:#6b7280;margin:0 0 12px">${esc(intro)}</p>
<table style="border-collapse:collapse;width:100%">${rows}</table>
<p style="margin-top:16px"><a href="${portal()}/notifications" style="color:#0284c7">Open all notifications</a></p>
<p style="color:#9ca3af;font-size:11px">Sent by the Zeronix portal each working morning.</p></div>`;
}

/** The mailbox that sends digests, or null when none is picked or it cannot be used. */
async function sender(): Promise<{ login: string; pass: string } | null> {
  const id = Number(await getSetting("notify_digest_from"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const [acc] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, id));
  if (!acc?.enabled) return null;
  try {
    return { login: acc.imapUser, pass: decryptSecret(acc.passwordEnc) };
  } catch {
    return null;
  }
}

/** Sends the morning digests and the admin team summary. Returns how many emails went out. */
export async function sendDigests(day: string): Promise<{ emails: number; summaries: number }> {
  const [lines, users, from] = await Promise.all([
    openLines(),
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role }).from(schema.users).where(eq(schema.users.isActive, true)),
    sender(),
  ]);
  const name = (id: number) => users.find((u) => u.id === id)?.name ?? "?";
  const { smtpHost, smtpPort } = mailServer();
  const transport = from
    ? nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: from.login, pass: from.pass }, connectionTimeout: 20_000, socketTimeout: 60_000 })
    : null;
  let emails = 0;
  const send = async (to: string, subject: string, html: string) => {
    if (!transport || !from || !to.includes("@")) return;
    try {
      await transport.sendMail({ from: { name: "Zeronix portal", address: from.login }, to, subject, html });
      emails++;
    } catch (e) {
      console.error(`[notify] digest to ${to} failed:`, (e as Error).message);
    }
  };

  try {
    // each person's own day
    for (const u of users) {
      const mine = lines.filter((l) => l.userId === u.id).slice(0, 40);
      if (!mine.length) continue;
      const urgent = mine.filter((l) => l.priority === "critical" || l.priority === "high").length;
      await send(
        u.email,
        urgent ? `Your day: ${urgent} need${urgent === 1 ? "s" : ""} you first` : `Your day: ${mine.length} open item${mine.length === 1 ? "" : "s"}`,
        page(`Good morning, ${u.name.split(" ")[0]}`, `${mine.length} open item${mine.length === 1 ? "" : "s"} in your portal, most urgent first.`, mine.map((l) => lineHtml(l)).join("")),
      );
    }

    // the admins' team summary: what is critical or high across everyone else
    const team = lines.filter((l) => (l.priority === "critical" || l.priority === "high") && users.find((u) => u.id === l.userId)?.role !== "admin");
    const admins = users.filter((u) => u.role === "admin");
    if (team.length && admins.length) {
      const critical = team.filter((l) => l.priority === "critical").length;
      const people = [...new Set(team.map((l) => l.userId))];
      const rows = people
        .sort((a, b) => team.filter((l) => l.userId === b).length - team.filter((l) => l.userId === a).length)
        .map((p) => `<tr><td colspan="2" style="padding:10px 0 2px;font-weight:bold;border-bottom:1px solid #e5e7eb">${esc(name(p))}</td></tr>${team.filter((l) => l.userId === p).slice(0, 15).map((l) => lineHtml(l)).join("")}`)
        .join("");
      const title = `Team summary: ${critical} critical, ${team.length - critical} high across ${people.length} ${people.length === 1 ? "person" : "people"}`;
      for (const a of admins) await send(a.email, title, page("Team summary", "Open critical and high alerts per person this morning.", rows));
      await notify({
        userIds: admins.map((a) => a.id),
        kind: "digest",
        rule: "team_summary",
        priority: critical ? "high" : "normal",
        title,
        body: people.map((p) => `${name(p).split(" ")[0]} ${team.filter((l) => l.userId === p).length}`).join(", "),
        link: "/notifications?view=team",
        key: `team_summary:${day}`,
      });
    }
    return { emails, summaries: team.length ? admins.length : 0 };
  } finally {
    transport?.close();
  }
}

/** For admins: everyone's open critical and high alerts (the team view on the Notifications page). */
export async function teamOpen() {
  const now = new Date();
  return db
    .select({ id: n.id, userName: schema.users.name, priority: n.priority, title: n.title, body: n.body, link: n.link, dueAt: n.dueAt, createdAt: n.createdAt, rule: n.rule })
    .from(n)
    .innerJoin(schema.users, eq(schema.users.id, n.userId))
    .where(and(isNull(n.resolvedAt), inArray(n.priority, ["critical", "high"]), inArray(n.kind, ["system", "assign"]), or(isNull(n.snoozedUntil), lte(n.snoozedUntil, now)), eq(schema.users.isActive, true)))
    .orderBy(asc(schema.users.name), asc(n.createdAt))
    .limit(500);
}
