import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The connector's tools run the normal server actions; here there is no Next request around them.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

import { handleRpc, type RpcServer } from "@/lib/mcp/rpc";
import { CLAUDE_CALLBACK, parseScope, pkceMatches, redirectAllowed, redirectMatches } from "@/lib/mcp/oauth-rules";
import { UserError } from "@/lib/user-error";

const verifier = "a".repeat(20) + "-B_c.d~" + "e".repeat(30);
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("Claude connector: sign-in rules", () => {
  it("accepts only Claude's callback and Claude Code's loopback address", () => {
    expect(redirectAllowed(CLAUDE_CALLBACK)).toBe(true);
    expect(redirectAllowed("http://localhost:51234/callback")).toBe(true);
    expect(redirectAllowed("http://127.0.0.1:9/callback")).toBe(true);
    expect(redirectAllowed("https://evil.example/api/mcp/auth_callback")).toBe(false);
    expect(redirectAllowed("http://localhost:3000/other")).toBe(false);
    expect(redirectAllowed("http://user:pw@localhost:3000/callback")).toBe(false);
    expect(redirectAllowed("javascript:alert(1)")).toBe(false);
  });

  it("matches a loopback address on any port, but not another host", () => {
    const reg = ["http://localhost:3118/callback"];
    expect(redirectMatches(reg, "http://localhost:40000/callback")).toBe(true);
    expect(redirectMatches(reg, "http://127.0.0.1:40000/callback")).toBe(false);
    expect(redirectMatches([CLAUDE_CALLBACK], CLAUDE_CALLBACK)).toBe(true);
    expect(redirectMatches([CLAUDE_CALLBACK], "http://localhost:1/callback")).toBe(false);
  });

  it("checks PKCE S256", () => {
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier + "x", challenge)).toBe(false);
    expect(pkceMatches("short", createHash("sha256").update("short").digest("base64url"))).toBe(false);
  });

  it("hands out read always, write only when asked", () => {
    expect(parseScope("")).toEqual(["read"]);
    expect(parseScope("read")).toEqual(["read"]);
    expect(parseScope("read write offline_access")).toEqual(["read", "write"]);
    expect(parseScope("admin")).toEqual(["read"]);
  });
});

describe("Claude connector: JSON-RPC", () => {
  const server = (canWrite: boolean): RpcServer => ({
    canWrite,
    tools: [
      { name: "look", title: "Look", description: "", inputSchema: { type: "object" }, write: false },
      { name: "change", title: "Change", description: "", inputSchema: { type: "object" }, write: true },
      { name: "refuse", title: "Refuse", description: "", inputSchema: { type: "object" }, write: false },
      { name: "crash", title: "Crash", description: "", inputSchema: { type: "object" }, write: false },
    ],
    async run(name) {
      if (name === "refuse") throw new UserError("There is no deal 9.");
      if (name === "crash") throw new Error("SELECT secret FROM x failed");
      return { content: [{ type: "text", text: `ran ${name}` }] };
    },
  });

  it("answers initialize with its protocol and instructions", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, server(false))) as { result: Record<string, unknown> };
    expect(r.result.protocolVersion).toBe("2025-06-18");
    expect(String(r.result.instructions)).toMatch(/read only/);
  });

  it("hides write tools from a read-only connection and refuses them", async () => {
    const list = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, server(false))) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
    expect(list.result.tools.map((t) => t.name)).not.toContain("change");
    expect(list.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
    const call = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "change" } }, server(false))) as { result: { isError: boolean } };
    expect(call.result.isError).toBe(true);
    const ok = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "change" } }, server(true))) as { result: { content: { text: string }[] } };
    expect(ok.result.content[0].text).toBe("ran change");
  });

  it("shows refusals but never raw server errors", async () => {
    const refused = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "refuse" } }, server(true))) as { result: { isError: boolean; content: { text: string }[] } };
    expect(refused.result.content[0].text).toBe("There is no deal 9.");
    const crashed = (await handleRpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "crash" } }, server(true))) as { result: { content: { text: string }[] } };
    expect(crashed.result.content[0].text).not.toMatch(/SELECT/);
  });

  it("rejects unknown tools and methods; notifications get no answer", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope" } }, server(true))).toMatchObject({ error: { code: -32602 } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 8, method: "resources/list" }, server(true))).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, server(true))).toBeNull();
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("Claude connector: tokens and tools (needs the test database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let eq: typeof import("drizzle-orm").eq;
  let O: typeof import("@/lib/mcp/oauth");
  let tools: typeof import("@/lib/mcp/tools").mcpTools;
  const tag = `ZZMCP${Date.now()}`;
  let admin: number, seller: number, clientId: string;
  const ru = "http://localhost:4567/callback";

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    ({ eq } = await import("drizzle-orm"));
    O = await import("@/lib/mcp/oauth");
    tools = (await import("@/lib/mcp/tools")).mcpTools;
    const mk = async (name: string, role: "admin" | "sales") =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role }).returning({ id: schema.users.id }))[0].id;
    admin = await mk("admin", "admin");
    seller = await mk("seller", "sales");
    clientId = await O.registerClient("Claude Code", [ru]);
  });

  afterAll(async () => {
    const { pool } = await import("@/db");
    await pool.end();
  });

  const connect = async (userId: number, scope: string) => {
    const code = await O.issueCode({ userId, userSv: 1, clientId, scope, redirectUri: ru, codeChallenge: challenge });
    return { code, tokens: () => O.exchangeCode({ code, clientId, redirectUri: ru, codeVerifier: verifier }) };
  };

  it("turns a code into tokens once, with PKCE", async () => {
    const { code, tokens } = await connect(admin, "read");
    await expect(O.exchangeCode({ code, clientId, redirectUri: ru, codeVerifier: verifier + "x" })).rejects.toMatchObject({ code: "invalid_grant" });
    const t = await tokens();
    expect(t.scope).toBe("read");
    const auth = await O.verifyAccess(`Bearer ${t.access_token}`);
    expect(auth).toMatchObject({ userId: admin, write: false });
    // the same code again ends the connection
    await expect(tokens()).rejects.toMatchObject({ code: "invalid_grant" });
    expect(await O.verifyAccess(`Bearer ${t.access_token}`)).toBeNull();
  });

  it("rotates refresh tokens; an old one no longer works", async () => {
    const t = await (await connect(admin, "read write")).tokens();
    const t2 = await O.refreshTokens({ refreshToken: t.refresh_token, clientId });
    expect(t2.refresh_token).not.toBe(t.refresh_token);
    await expect(O.refreshTokens({ refreshToken: t.refresh_token, clientId })).rejects.toMatchObject({ code: "invalid_grant" });
    expect((await O.verifyAccess(`Bearer ${t2.access_token}`))?.write).toBe(true);
  });

  it("never lets a non-admin connect, and a session cookie is not an access token", async () => {
    await expect((await connect(seller, "read")).tokens()).rejects.toMatchObject({ code: "invalid_grant" });
    const { signSession } = await import("@/lib/auth/token");
    const cookie = await signSession({ id: admin, name: "x", email: "x@example.test", role: "admin", sv: 1 });
    expect(await O.verifyAccess(`Bearer ${cookie}`)).toBeNull();
  });

  it("stops at once when disconnected or when the admin signs out everywhere", async () => {
    const t = await (await connect(admin, "read")).tokens();
    const auth = await O.verifyAccess(`Bearer ${t.access_token}`);
    await O.revokeConnection(auth!.grantId);
    expect(await O.verifyAccess(`Bearer ${t.access_token}`)).toBeNull();
    await expect(O.refreshTokens({ refreshToken: t.refresh_token, clientId })).rejects.toMatchObject({ code: "invalid_grant" });

    const t2 = await (await connect(admin, "read")).tokens();
    await db.update(schema.users).set({ sessionVersion: 2 }).where(eq(schema.users.id, admin));
    expect(await O.verifyAccess(`Bearer ${t2.access_token}`)).toBeNull();
    await db.update(schema.users).set({ sessionVersion: 1 }).where(eq(schema.users.id, admin));
  });

  it("runs read tools and records write tools in the audit trail", async () => {
    const t = await (await connect(admin, "read write")).tokens();
    const auth = (await O.verifyAccess(`Bearer ${t.access_token}`))!;
    const ctx = { auth, viewer: { id: auth.userId, seesAll: true }, base: "https://portal.test" };
    const tool = (n: string) => tools.find((x) => x.name === n)!;

    const overview = await tool("business_overview").call({}, ctx);
    expect(overview.structuredContent).toHaveProperty("pipeline");

    const lead = await tool("create_lead").call({ customer_name: `${tag} Trading`, contact_name: "Sara", requirement: "20 laptops" }, ctx);
    const dealId = Number(lead.structuredContent?.dealId);
    expect(dealId).toBeGreaterThan(0);

    await tool("add_note").call({ deal_id: dealId, type: "call", text: "Spoke to Sara", follow_up_date: "2030-01-15" }, ctx);
    const [deal] = await db.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("contacted");

    const task = await tool("create_task").call({ title: `${tag} call back`, deal_id: dealId }, ctx);
    expect(task.structuredContent?.taskId).toBeTruthy();

    const quote = await tool("create_draft_quote").call({ deal_id: dealId, lines: [{ description: "Laptop", qty: 20, unit_price_aed: 2500 }] }, ctx);
    expect(quote.structuredContent?.status).toBe("draft");

    await tool("update_deal").call({ deal_id: dealId, stage: "negotiation", expected_close: "2030-02-01" }, ctx);
    const [after] = await db.select({ stage: schema.deals.stage, close: schema.deals.expectedClose }).from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(after).toEqual({ stage: "negotiation", close: "2030-02-01" });

    const trail = await db.select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.userId, admin));
    expect(trail.map((r) => r.action)).toEqual(expect.arrayContaining(["claude.create_lead", "claude.add_note", "claude.create_task", "claude.create_draft_quote", "claude.update_deal"]));

    const timeline = await db.select({ body: schema.activities.body }).from(schema.activities).where(eq(schema.activities.dealId, dealId));
    expect(timeline.some((a) => a.body.includes("(via Claude)"))).toBe(true);
  });
});
