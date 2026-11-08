import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminQuery, closeAdmin } from "./helpers/orgs";

// two cookies by name (the organisation's sign-in and the platform console's), set and read like a browser would
const jar = new Map<string, string>();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers({ host: "demo.test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`redirect:${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET && !!process.env.TEST_ADMIN_DATABASE_URL;

describe.skipIf(!live)("the platform console (needs the test database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let sql: typeof import("drizzle-orm").sql;
  const tag = `ZZPLAT${Date.now()}`;
  const email = `${tag.toLowerCase()}@platform.test`;
  const password = "a-long-platform-password";
  let secret = "";
  let adminId = 0;
  let orgId = 0;
  let inviteToken = "";

  const codeNow = async (offset = 0) => {
    const { totpCode, totpStep } = await import("@/lib/totp");
    return totpCode(secret, totpStep() + offset);
  };
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const platformLogin = async (code: string) => {
    const { platformLogin: login } = await import("@/app/(platform)/platform/login/actions");
    return login(undefined, form({ email, password, code })).catch((e: Error) => (e.message.startsWith("redirect:") ? { redirected: e.message } : Promise.reject(e)));
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ sql } = await import("drizzle-orm"));
    const { newTotpSecret } = await import("@/lib/totp");
    const { encryptSecret } = await import("@/lib/crypto");
    const bcrypt = (await import("bcryptjs")).default;
    secret = newTotpSecret();
    [{ id: adminId }] = await adminQuery<{ id: number }>("INSERT INTO platform_admins (name, email, password_hash, totp_secret) VALUES ($1, $2, $3, $4) RETURNING id", [
      `${tag} Admin`,
      email,
      await bcrypt.hash(password, 10),
      encryptSecret(secret),
    ]);
  });

  afterAll(async () => {
    const { closeBus } = await import("@/lib/chat/bus");
    await closeBus();
    await pool.end();
    await closeAdmin();
  });

  it("signs in only with the password and a fresh authenticator code, each code once", async () => {
    jar.clear();
    expect(await platformLogin("000000")).toEqual({ error: "Wrong email, password or code." });
    const code = await codeNow();
    expect(await platformLogin(code)).toEqual({ redirected: "redirect:/platform" });
    expect(jar.has("zp_platform")).toBe(true);
    // the same code again (a replay) is refused
    jar.delete("zp_platform");
    expect(await platformLogin(code)).toMatchObject({ error: expect.any(String) });
    expect(jar.has("zp_platform")).toBe(false);
    // next time step: fine again
    expect(await platformLogin(await codeNow(1))).toEqual({ redirected: "redirect:/platform" });
  });

  it("a tenant cookie can never pass as a platform cookie", async () => {
    const { signSession } = await import("@/lib/auth/token");
    const { verifyPlatform } = await import("@/lib/auth/platform-token");
    const tenant = await signSession({ id: adminId, name: "x", email, role: "admin", sv: 1, org: 1 });
    expect(await verifyPlatform(tenant)).toBeNull();
    const { loadPlatformAdmin } = await import("@/platform/session");
    expect((await loadPlatformAdmin())?.id).toBe(adminId);
  });

  it("creates an organisation that is ready to use, and its first admin joins by link", async () => {
    const { createTenantAction } = await import("@/app/(platform)/platform/actions");
    const r = await createTenantAction({ name: `${tag} Trading LLC`, trn: "100000000000077", adminName: "Fatima", adminEmail: `${tag.toLowerCase()}-first@example.test` });
    if (!r.ok) throw new Error(r.error);
    orgId = r.id;
    expect(r.inviteUrl).toMatch(/^http:\/\/demo\.test\/invite\/[A-Za-z0-9_-]{40,}$/);
    inviteToken = r.inviteUrl.split("/invite/")[1];
    const [org] = await adminQuery<{ enabled_apps: string[]; status: string }>("SELECT enabled_apps, status FROM organizations WHERE id = $1", [orgId]);
    expect(org.status).toBe("active");
    expect(org.enabled_apps).toEqual(["crm", "sales", "accounts", "projects", "tasks", "files", "chat"]);
    const [brand] = await adminQuery<{ company: string }>("SELECT company FROM brand_profile WHERE organization_id = $1", [orgId]);
    expect(brand.company).toBe(`${tag} Trading LLC`);
    const [types] = await adminQuery<{ n: number }>("SELECT count(*)::int AS n FROM project_types WHERE organization_id = $1", [orgId]);
    expect(types.n).toBe(8);
    // the same name twice is refused
    const again = await createTenantAction({ name: `${tag} Trading LLC`, adminName: "X", adminEmail: `${tag.toLowerCase()}-x@example.test` });
    expect(again).toMatchObject({ ok: false });

    const { lookupInvite, acceptInvite } = await import("@/lib/invites");
    expect(await lookupInvite(inviteToken)).toMatchObject({ orgId, orgName: `${tag} Trading LLC`, role: "admin", problem: null });
    const u = await acceptInvite(inviteToken, { name: "Fatima", password: "fatima-password" });
    expect(u).toMatchObject({ orgId, role: "admin" });
    expect((await lookupInvite(inviteToken))?.problem).toMatch(/already used/);
    await expect(acceptInvite(inviteToken, { name: "Again", password: "fatima-password" })).rejects.toThrow(/already used/);
    // a made-up token is nothing
    expect(await lookupInvite("x".repeat(43))).toBeNull();
  });

  it("keeps the user limit", async () => {
    const { setPlanAction } = await import("@/app/(platform)/platform/actions");
    expect(await setPlanAction(orgId, { apps: ["crm", "sales", "accounts", "projects", "tasks", "files", "chat"], userLimit: 1 })).toEqual({ ok: true });
    const { createInvite } = await import("@/lib/invites");
    await expect(createInvite(orgId, { email: `${tag.toLowerCase()}-2@example.test`, role: "sales", createdBy: null })).rejects.toThrow(/allows 1 active user/);
    await setPlanAction(orgId, { apps: ["crm", "sales", "accounts", "projects", "tasks", "files", "chat"], userLimit: null });
  });

  it("enters read only: the banner's flag is set, and neither the app nor the database accepts a change", async () => {
    const { enterAction } = await import("@/app/(platform)/platform/actions");
    await expect(enterAction(orgId, true, "")).rejects.toThrow(/redirect:\//);
    const { loadAccess, assertApp } = await import("@/lib/auth/session");
    const access = await loadAccess();
    expect(access).toMatchObject({ orgId, support: { adminId, readOnly: true } });
    expect(access?.apps).not.toContain("procurement");
    await expect(assertApp("crm")).rejects.toThrow(/read-only support view/);
    // the database itself refuses: the connection is in read-only mode for this request
    await expect(db.insert(schema.companies).values({ name: `${tag} sneaky`, nameNorm: "sneaky" })).rejects.toThrow();
    const n = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM companies`);
    expect(n.rows[0].n).toBe(0);
    // without the platform sign-in the visit is over
    const platform = jar.get("zp_platform")!;
    jar.delete("zp_platform");
    expect(await loadAccess()).toBeNull();
    jar.set("zp_platform", platform);
  });

  it("changes need a reason, and then go through", async () => {
    const { enterAction } = await import("@/app/(platform)/platform/actions");
    expect(await enterAction(orgId, false, "")).toMatchObject({ ok: false, error: expect.stringMatching(/Say why/) });
    await expect(enterAction(orgId, false, "ticket 12: fix the TRN")).rejects.toThrow(/redirect:\//);
    const { loadAccess, assertApp } = await import("@/lib/auth/session");
    expect((await loadAccess())?.support).toMatchObject({ readOnly: false });
    await expect(assertApp("crm")).resolves.toBeTruthy();
    await db.insert(schema.companies).values({ name: `${tag} fixed`, nameNorm: `${tag.toLowerCase()} fixed` });
    // but never the person's own account
    const { signOutEverywhere } = await import("@/app/(app)/account/actions");
    await expect(signOutEverywhere()).rejects.toThrow(/support visit/);
  });

  it("the company sees every visit and cannot change or remove the record", async () => {
    const { SupportVisits } = await import("@/app/(app)/admin/users/support-visits");
    expect(SupportVisits).toBeTypeOf("function");
    const rows = await db.select().from(schema.platformAuditLog);
    expect(rows.every((r) => r.organizationId === orgId)).toBe(true);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["tenant.create", "support.enter", "support.changes"]));
    expect(rows.find((r) => r.action === "support.changes")?.reason).toBe("ticket 12: fix the TRN");
    await expect(db.execute(sql`DELETE FROM platform_audit_log`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE platform_audit_log SET reason = ''`)).rejects.toThrow();
    // and the app's role cannot read who the platform admins are
    await expect(db.execute(sql`SELECT * FROM platform_admins`)).rejects.toThrow();
  });

  it("pausing an organisation ends its sessions and stops its sign-in", async () => {
    const { setStatusAction } = await import("@/app/(platform)/platform/actions");
    expect(await setStatusAction(orgId, "suspended", "test")).toEqual({ ok: true });
    const { loadAccess } = await import("@/lib/auth/session");
    expect(await loadAccess()).toBeNull();
    const { loginUser } = await import("@/lib/auth/login-user");
    expect((await loginUser(`${tag.toLowerCase()}-first@example.test`))?.orgActive).toBe(false);
    await setStatusAction(orgId, "active", "test over");
  });

  it("the console refuses anyone without a platform sign-in", async () => {
    jar.clear();
    const { createTenantAction } = await import("@/app/(platform)/platform/actions");
    expect(await createTenantAction({ name: `${tag} nope`, adminName: "N", adminEmail: "n@example.test" })).toMatchObject({ ok: false, error: expect.stringMatching(/sign in/i) });
  });
});
