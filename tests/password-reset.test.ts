import "dotenv/config";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminQuery, createTestOrg } from "./helpers/orgs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers({ host: "demo.test" }) }));
// the platform mailbox: every email is kept here instead of being sent
const sent = vi.hoisted(() => [] as { to: string; subject: string; button?: { url: string } }[]);
vi.mock("@/lib/platform-mail", () => ({
  platformMailReady: () => true,
  sendPlatformMail: async (m: { to: string; subject: string; button?: { url: string } }) => (sent.push(m), true),
}));

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET && !!process.env.TEST_ADMIN_DATABASE_URL;
const tokenOf = (m: { button?: { url: string } }) => m.button!.url.split("/reset-password/")[1];

describe.skipIf(!live)("forgot password (needs the test database)", () => {
  let R: typeof import("@/lib/auth/password-reset");
  const tag = `ZZRESET${Date.now()}`;
  const email = `${tag.toLowerCase()}@reset.test`;
  let orgId = 0;
  let userId = 0;

  beforeAll(async () => {
    process.env.APP_PUBLIC_URL = "https://demo.test";
    R = await import("@/lib/auth/password-reset");
    orgId = (await createTestOrg({ name: `${tag} LLC` }))[0].id;
    const hash = await bcrypt.hash("the-old-password", 10);
    userId = (
      await adminQuery<{ id: number }>("INSERT INTO users (organization_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'sales') RETURNING id", [orgId, "Reem Saleh", email, hash])
    )[0].id;
  });

  afterAll(() => {
    delete process.env.APP_PUBLIC_URL;
  });

  it("emails a one-time link to a known address, and answers the same for an unknown one", async () => {
    await R.requestPasswordReset(`nobody-${tag}@reset.test`, "10.0.0.1");
    expect(sent).toHaveLength(0);
    await R.requestPasswordReset(email.toUpperCase(), "10.0.0.1");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: email, subject: "Reset your ZeronixOS password" });
    expect(sent[0].button!.url).toMatch(/^https:\/\/demo\.test\/reset-password\/[A-Za-z0-9_-]{40,}$/);
    // only the hash is kept
    const token = tokenOf(sent[0]);
    const rows = await adminQuery<{ token_hash: string; organization_id: number }>("SELECT token_hash, organization_id FROM password_resets WHERE user_id = $1", [userId]);
    expect(rows).toEqual([{ token_hash: createHash("sha256").update(token).digest("hex"), organization_id: orgId }]);
    expect(await R.lookupReset(token)).toMatchObject({ orgId, userId, email, problem: null });
  });

  it("sets the new password once, signs the person out everywhere and closes their other links", async () => {
    await R.requestPasswordReset(email, "10.0.0.1");
    const [first, second] = sent.slice(-2).map(tokenOf);
    const [before] = await adminQuery<{ session_version: number }>("SELECT session_version FROM users WHERE id = $1", [userId]);
    await expect(R.resetPassword(second, "short")).rejects.toThrow(/at least 8/);
    await R.resetPassword(second, "the-new-password");
    const [after] = await adminQuery<{ password_hash: string; session_version: number }>("SELECT password_hash, session_version FROM users WHERE id = $1", [userId]);
    expect(await bcrypt.compare("the-new-password", after.password_hash)).toBe(true);
    expect(after.session_version).toBe(before.session_version + 1);
    await expect(R.resetPassword(second, "again-a-password")).rejects.toThrow(/already used/);
    // the older link was closed by the reset
    expect((await R.lookupReset(first))?.problem).toMatch(/already used/);
    const audit = await adminQuery<{ action: string }>("SELECT action FROM audit_log WHERE organization_id = $1 AND user_id = $2 ORDER BY id", [orgId, userId]);
    expect(audit.map((a) => a.action)).toEqual(["auth.reset_request", "auth.reset_request", "auth.reset_done"]);
  });

  it("sends at most three links an hour to one person", async () => {
    const n = sent.length;
    for (let i = 0; i < 3; i++) await R.requestPasswordReset(email, "10.0.0.2");
    // two earlier requests already fall in the hour
    expect(sent.length - n).toBe(1);
  });

  it("refuses expired links, unknown links and paused companies", async () => {
    const token = "e".repeat(43);
    await adminQuery("INSERT INTO password_resets (organization_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() - interval '1 minute')", [
      orgId,
      userId,
      createHash("sha256").update(token).digest("hex"),
    ]);
    expect((await R.lookupReset(token))?.problem).toMatch(/expired/);
    await expect(R.resetPassword(token, "whatever-password")).rejects.toThrow(/expired/);
    expect(await R.lookupReset("x".repeat(43))).toBeNull();
    expect(await R.lookupReset("../../etc")).toBeNull();

    await adminQuery("DELETE FROM password_resets WHERE user_id = $1", [userId]);
    await adminQuery("UPDATE organizations SET status = 'suspended' WHERE id = $1", [orgId]);
    const n = sent.length;
    await R.requestPasswordReset(email, "10.0.0.3");
    expect(sent.length).toBe(n);
    await adminQuery("UPDATE organizations SET status = 'active' WHERE id = $1", [orgId]);
  });
});
