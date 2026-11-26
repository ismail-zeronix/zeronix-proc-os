import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminQuery } from "./helpers/orgs";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers({ host: "demo.test" }) }));
const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/lib/platform-mail", () => ({
  platformMailReady: () => true,
  sendPlatformMail: async (m: { to: string; subject: string }) => (sent.push(m), true),
}));

const live = !!process.env.DATABASE_URL && !!process.env.TEST_ADMIN_DATABASE_URL;

describe.skipIf(!live)("trial requests (needs the test database)", () => {
  let T: typeof import("@/lib/trial-requests");
  const tag = `ZZTRIAL${Date.now()}`;
  const email = `${tag.toLowerCase()}@trial.test`;
  const input = { company: `${tag} Interiors LLC`, contactName: "Sara Ali", email, phone: "+971 50 000 0000", teamSize: "6-20", message: "Fit-out projects" };

  beforeAll(async () => {
    process.env.PLATFORM_NOTIFY_EMAIL = "owner@platform.test";
    T = await import("@/lib/trial-requests");
  });

  afterAll(() => {
    delete process.env.PLATFORM_NOTIFY_EMAIL;
  });

  it("saves a request through the app's role, thanks the person and tells the platform", async () => {
    const r = await T.submitTrialRequest(input, "10.9.9.9");
    expect(r.isNew).toBe(true);
    const [row] = await adminQuery<{ company: string; email: string; status: string; ip: string; team_size: string }>(
      "SELECT company, email, status, ip, team_size FROM trial_requests WHERE id = $1",
      [r.id],
    );
    expect(row).toEqual({ company: input.company, email, status: "new", ip: "10.9.9.9", team_size: "6-20" });
    expect(sent.map((m) => [m.to, m.subject])).toEqual([
      [email, "Your ZeronixOS trial request"],
      ["owner@platform.test", `[ZeronixOS platform] New trial request: ${input.company}`],
    ]);
  });

  it("treats the same email again within a week as the same request, sending nothing more", async () => {
    const before = sent.length;
    const again = await T.submitTrialRequest({ ...input, email: email.toUpperCase(), company: "Another name" }, "10.9.9.9");
    expect(again.isNew).toBe(false);
    const rows = await adminQuery<{ id: number }>("SELECT id FROM trial_requests WHERE email = $1", [email]);
    expect(rows).toEqual([{ id: again.id }]);
    expect(sent.length).toBe(before);
  });

  it("is never readable by the app's role", async () => {
    const { db, schema } = await import("@/db");
    const err = (await db
      .select()
      .from(schema.trialRequests)
      .then(() => null)
      .catch((e: unknown) => e)) as { code?: string; cause?: { code?: string } } | null;
    // 42501: insufficient privilege (roles.ts takes the app's rights away)
    expect(err?.cause?.code ?? err?.code).toBe("42501");
  });
});
