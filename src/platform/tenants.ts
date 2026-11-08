import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, runAsOrg, schema as tenantSchema } from "@/db";
import { TENANT_CORE_APPS, isAppKey, type AppKey } from "@/lib/apps";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import type { PlatformSession } from "@/lib/auth/platform-token";
import { createInvite } from "@/lib/invites";
import { aeVat } from "@/lib/tax/ae-vat";
import { UserError } from "@/lib/user-error";
import { platformDb, schema } from "./db";
import { platformAudit } from "./session";

/** Every organisation with what the console lists: people, last sign-in, documents, file storage. */
export async function listTenants() {
  const r = await platformDb.execute<{
    id: number;
    name: string;
    status: string;
    created_at: Date;
    enabled_apps: string[] | null;
    user_limit: number | null;
    users: number;
    last_login: Date | null;
    quotes: number;
    invoices: number;
    storage: number;
  }>(sql`
    SELECT o.id, o.name, o.status, o.created_at, o.enabled_apps, o.user_limit,
      (SELECT count(*)::int FROM users u WHERE u.organization_id = o.id AND u.is_active) AS users,
      (SELECT max(a.at) FROM audit_log a WHERE a.organization_id = o.id AND a.action = 'auth.login') AS last_login,
      (SELECT count(*)::int FROM quotes q WHERE q.organization_id = o.id) AS quotes,
      (SELECT count(*)::int FROM invoices i WHERE i.organization_id = o.id) AS invoices,
      (SELECT coalesce(sum(f.size), 0)::float FROM files f WHERE f.organization_id = o.id) AS storage
    FROM organizations o ORDER BY o.id`);
  return r.rows;
}

export async function getTenant(id: number) {
  const [org] = await platformDb.select().from(schema.organizations).where(eq(schema.organizations.id, id));
  if (!org) return null;
  const [people, visits, invites] = await Promise.all([
    platformDb
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, isActive: schema.users.isActive, createdAt: schema.users.createdAt })
      .from(schema.users)
      .where(eq(schema.users.organizationId, id))
      .orderBy(schema.users.id),
    platformDb.select().from(schema.platformAuditLog).where(eq(schema.platformAuditLog.organizationId, id)).orderBy(sql`${schema.platformAuditLog.at} DESC`).limit(30),
    platformDb
      .select({ email: schema.invites.email, role: schema.invites.role, expiresAt: schema.invites.expiresAt, usedAt: schema.invites.usedAt, createdAt: schema.invites.createdAt, expired: sql<boolean>`${schema.invites.expiresAt} < now()` })
      .from(schema.invites)
      .where(eq(schema.invites.organizationId, id))
      .orderBy(sql`${schema.invites.createdAt} DESC`)
      .limit(10),
  ]);
  return { org, people, visits, invites };
}

/** What the console's health box shows: errors of the last day, background downloads waiting, organisations. */
export async function platformHealth() {
  const r = await platformDb.execute<{ errors: number; exports_waiting: number; exports_failed: number; orgs: number; paused: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM error_log WHERE at > now() - interval '1 day') AS errors,
      (SELECT count(*)::int FROM export_jobs WHERE status IN ('queued', 'running')) AS exports_waiting,
      (SELECT count(*)::int FROM export_jobs WHERE status = 'failed' AND created_at > now() - interval '1 day') AS exports_failed,
      (SELECT count(*)::int FROM organizations) AS orgs,
      (SELECT count(*)::int FROM organizations WHERE status <> 'active') AS paused`);
  return r.rows[0];
}

/** The kinds of project work a new organisation starts with (as Zeronix did; their admin edits them in Admin). */
const DEFAULT_PROJECT_TYPES = [
  ["cctv", "CCTV"],
  ["networking", "Networking & cabling"],
  ["server_room", "Server room"],
  ["access_control", "Access control"],
  ["av", "AV & meeting rooms"],
  ["it_fitout", "Office IT setup"],
  ["software", "Software & websites"],
  ["other", "Other"],
] as const;

export interface NewTenant {
  name: string;
  legalName?: string;
  trn?: string;
  emirate?: string;
  adminName: string;
  adminEmail: string;
  userLimit?: number | null;
}

/**
 * A new organisation, ready to use: its row (through the platform role: no organisation may add another), its own
 * brand name on documents, TRN, project types, the core apps, and a one-time link for its first admin.
 */
export async function createTenant(admin: PlatformSession, input: NewTenant): Promise<{ id: number; inviteUrl: string; expiresAt: Date }> {
  const name = input.name.trim();
  if (name.length < 2) throw new UserError("Enter the company name.");
  const trn = (input.trn ?? "").replace(/[\s-]/g, "");
  const badTrn = aeVat.validateTaxId(trn);
  if (badTrn) throw new UserError(badTrn);
  const limit = input.userLimit == null ? null : Math.floor(input.userLimit);
  if (limit != null && (limit < 1 || limit > 10_000)) throw new UserError("The user limit must be between 1 and 10,000, or empty for no limit.");
  const [dupe] = await platformDb.select({ id: schema.organizations.id }).from(schema.organizations).where(sql`lower(${schema.organizations.name}) = lower(${name})`);
  if (dupe) throw new UserError(`An organisation called "${name}" already exists (#${dupe.id}).`);

  const [org] = await platformDb
    .insert(schema.organizations)
    .values({ name, legalName: (input.legalName ?? "").trim(), country: "AE", baseCurrency: "AED", taxRegime: "AE_VAT", emirate: input.emirate || "dubai", enabledApps: TENANT_CORE_APPS, userLimit: limit })
    .returning({ id: schema.organizations.id });

  // the rest is the organisation's own data: written as that organisation, under its row-level security
  await runAsOrg(org.id, async () => {
    await db.insert(tenantSchema.brandProfile).values({ company: name, tagline: "", address: "", website: "", mainPhone: "", disclaimer: "" });
    if (trn) await db.insert(tenantSchema.settings).values({ key: "quote_trn", value: trn });
    await db.insert(tenantSchema.projectTypes).values(DEFAULT_PROJECT_TYPES.map(([key, label], i) => ({ key, label, position: i + 1 })));
  });
  const invite = await createInvite(org.id, { email: input.adminEmail, name: input.adminName, role: "admin", createdBy: null });
  await platformAudit({ admin, action: "tenant.create", orgId: org.id, summary: `${name} created; first admin invited: ${input.adminEmail.trim().toLowerCase()}` });
  return { id: org.id, inviteUrl: invite.url, expiresAt: invite.expiresAt };
}

export async function setTenantStatus(admin: PlatformSession, id: number, status: "active" | "suspended", reason: string) {
  if (reason.trim().length < 3) throw new UserError("Say why.");
  const [o] = await platformDb.update(schema.organizations).set({ status, updatedAt: new Date() }).where(eq(schema.organizations.id, id)).returning({ name: schema.organizations.name });
  if (!o) throw new UserError("That organisation does not exist.");
  await platformAudit({ admin, action: status === "active" ? "tenant.reactivate" : "tenant.suspend", orgId: id, summary: `${o.name} ${status === "active" ? "reactivated" : "paused"}`, reason });
}

export async function setTenantPlan(admin: PlatformSession, id: number, plan: { apps: string[] | null; userLimit: number | null }) {
  const apps = plan.apps === null ? null : [...new Set(plan.apps)].filter((a): a is AppKey => isAppKey(a) && a !== "admin");
  const limit = plan.userLimit == null ? null : Math.floor(plan.userLimit);
  if (limit != null && (limit < 1 || limit > 10_000)) throw new UserError("The user limit must be between 1 and 10,000, or empty for no limit.");
  const [o] = await platformDb.update(schema.organizations).set({ enabledApps: apps, userLimit: limit, updatedAt: new Date() }).where(eq(schema.organizations.id, id)).returning({ name: schema.organizations.name });
  if (!o) throw new UserError("That organisation does not exist.");
  await platformAudit({ admin, action: "tenant.plan", orgId: id, summary: `${o.name}: apps ${apps === null ? "all" : apps.join(", ") || "none"}; user limit ${limit ?? "none"}` });
}

export async function newInvite(admin: PlatformSession, id: number, input: { email: string; name: string; role: "admin" | "sales" }) {
  const invite = await createInvite(id, { ...input, createdBy: null });
  await platformAudit({ admin, action: "invite.create", orgId: id, summary: `Invitation for ${input.email.trim().toLowerCase()} (${input.role})` });
  return invite;
}

/**
 * A support visit: this browser is signed in to the organisation as its first active admin, read only unless changes
 * are switched on (with a reason). Lasts an hour, ends with the platform sign-in, shows a red banner on every page, and
 * the organisation's admin sees it in Admin. Every visit is recorded.
 */
export async function enterTenant(admin: PlatformSession, id: number, opts: { readOnly: boolean; reason: string }) {
  const reason = opts.reason.trim();
  if (!opts.readOnly && reason.length < 5) throw new UserError("Say why changes are needed (at least a few words). It is recorded and shown to the company.");
  const [org] = await platformDb.select({ name: schema.organizations.name, status: schema.organizations.status }).from(schema.organizations).where(eq(schema.organizations.id, id));
  if (!org) throw new UserError("That organisation does not exist.");
  if (org.status !== "active") throw new UserError("This organisation is paused. Reactivate it first.");
  const [as] = await platformDb
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, sv: schema.users.sessionVersion })
    .from(schema.users)
    .where(sql`${schema.users.organizationId} = ${id} AND ${schema.users.role} = 'admin' AND ${schema.users.isActive}`)
    .orderBy(schema.users.id)
    .limit(1);
  if (!as) throw new UserError("This organisation has no active admin yet (the invitation may not be used). Nothing to look at.");
  await platformAudit({
    admin,
    action: opts.readOnly ? "support.enter" : "support.changes",
    orgId: id,
    summary: `${admin.name} opened ${org.name} ${opts.readOnly ? "read only" : "with changes on"} (as ${as.email})`,
    reason,
  });
  await setSessionCookie({ id: as.id, name: as.name, email: as.email, role: as.role, sv: as.sv, org: id, support: { adminId: admin.id, readOnly: opts.readOnly } });
}
