import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dmKey, previewOf, tokensToText } from "@/lib/chat/text";
import type { ChatEvent } from "@/lib/chat/types";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

describe("chat text helpers", () => {
  it("gives two people the same DM key whoever starts it", () => {
    expect(dmKey(7, 3)).toBe("3:7");
    expect(dmKey(3, 7)).toBe("3:7");
  });

  it("reads mention and record tokens as plain text", () => {
    expect(tokensToText("Hi @[Rahul K](user:12), see #[ZQ-2026-0012](quote:4)")).toBe("Hi @Rahul K, see ZQ-2026-0012");
  });

  it("makes a one-line preview", () => {
    expect(previewOf("text", "  line one\n\nline two  ")).toBe("line one line two");
    expect(previewOf("card", "")).toBe("Shared a card");
    expect(previewOf("text", "x".repeat(300))).toHaveLength(120);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("chat (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let inArray: typeof import("drizzle-orm").inArray;
  let A: typeof import("@/app/(app)/chat/actions");
  let C: typeof import("@/lib/chat/channels");
  let bus: typeof import("@/lib/chat/bus");
  let ali: number, bina: number, carl: number, idle: number;
  let userIds: number[] = [];
  const channelIds: number[] = [];
  const tag = `ZZCHAT${Date.now()}`;

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    ({ inArray } = await import("drizzle-orm"));
    A = await import("@/app/(app)/chat/actions");
    C = await import("@/lib/chat/channels");
    bus = await import("@/lib/chat/bus");
    const mk = async (name: string) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x" }).returning({ id: schema.users.id }))[0].id;
    ali = await mk("ali");
    bina = await mk("bina");
    carl = await mk("carl");
    idle = await mk("idle"); // has not punched in
    userIds = [ali, bina, carl, idle];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values([ali, bina, carl].map((userId) => ({ userId, day: dubaiToday() })));
  });

  afterAll(async () => {
    if (channelIds.length) await db.delete(schema.chatChannels).where(inArray(schema.chatChannels.id, channelIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  });

  it("opens one DM per pair, whoever starts it", async () => {
    await as(ali);
    const a = await A.startDm(bina);
    await as(bina);
    const b = await A.startDm(ali);
    expect(b).toBe(a);
    channelIds.push(a);
  });

  it("delivers a message live, counts it unread, and clears it when read", async () => {
    const dm = channelIds[0];
    const got: ChatEvent[] = [];
    const off = bus.subscribe(bina, (e) => {
      if (e.t !== "resync") got.push(e);
    });
    // let the LISTEN connection come up
    await new Promise((r) => setTimeout(r, 500));

    await as(ali);
    const sent = await A.sendMessage({ channelId: dm, body: "  Can you check stock for @[Bina](user:2)?  " });
    expect(sent.body).toBe("Can you check stock for @[Bina](user:2)?");

    await vi.waitFor(() => expect(got.some((e) => e.t === "message.new" && e.message.id === sent.id)).toBe(true), { timeout: 3000 });
    off();

    const forBina = (await C.listChannelsFor(bina)).find((c) => c.id === dm)!;
    expect(forBina.unread).toBe(1);
    expect(forBina.name).toBe(`${tag}-ali`);
    expect(forBina.lastPreview).toBe("Can you check stock for @Bina?");
    // your own message is never unread
    expect((await C.listChannelsFor(ali)).find((c) => c.id === dm)!.unread).toBe(0);

    await as(bina);
    await A.markChannelRead(dm, sent.id);
    expect((await C.listChannelsFor(bina)).find((c) => c.id === dm)!.unread).toBe(0);
  });

  it("keeps other people out of a DM", async () => {
    await as(carl);
    await expect(A.sendMessage({ channelId: channelIds[0], body: "hello" })).rejects.toThrow(/not in it/);
    await expect(A.markChannelRead(channelIds[0], 1)).rejects.toThrow(/not in it/);
    expect((await C.listChannelsFor(carl)).some((c) => c.id === channelIds[0])).toBe(false);
  });

  it("refuses empty and overlong messages, and people who have not punched in", async () => {
    await as(ali);
    await expect(A.sendMessage({ channelId: channelIds[0], body: "   " })).rejects.toThrow();
    await expect(A.sendMessage({ channelId: channelIds[0], body: "x".repeat(4001) })).rejects.toThrow();
    await as(idle);
    await expect(A.startDm(ali)).rejects.toThrow(/Punch in/);
  });
});

describe.skipIf(!live)("chat channels, deal threads, replies and reactions (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let inArray: typeof import("drizzle-orm").inArray;
  let eq: typeof import("drizzle-orm").eq;
  let A: typeof import("@/app/(app)/chat/actions");
  let S: typeof import("@/app/(app)/sales/actions");
  let C: typeof import("@/lib/chat/channels");
  let M: typeof import("@/lib/chat/messages");
  let ali: number, bina: number, carl: number, boss: number, companyId: number, dealId: number;
  let userIds: number[] = [];
  const tag = `ZZCHAT2${Date.now()}`;

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    ({ inArray, eq } = await import("drizzle-orm"));
    A = await import("@/app/(app)/chat/actions");
    S = await import("@/app/(app)/sales/actions");
    C = await import("@/lib/chat/channels");
    M = await import("@/lib/chat/messages");
    const mk = async (name: string, role: "admin" | "sales" = "sales") =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role }).returning({ id: schema.users.id }))[0].id;
    ali = await mk("ali");
    bina = await mk("bina");
    carl = await mk("carl");
    boss = await mk("boss", "admin");
    userIds = [ali, bina, carl, boss];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Trading`, nameNorm: `${tag}trading`.toLowerCase(), ownerId: ali }).returning({ id: schema.companies.id }))[0].id;
    dealId = (await db.insert(schema.deals).values({ title: `${tag} 20 laptops`, companyId, ownerId: ali }).returning({ id: schema.deals.id }))[0].id;
    await db.insert(schema.dealAssignees).values([
      { dealId, userId: ali, position: 0 },
      { dealId, userId: bina, position: 1 },
    ]);
  });

  afterAll(async () => {
    const ch = await db.select({ id: schema.chatMembers.channelId }).from(schema.chatMembers).where(inArray(schema.chatMembers.userId, userIds));
    if (ch.length) await db.delete(schema.chatChannels).where(inArray(schema.chatChannels.id, [...new Set(ch.map((c) => c.id))]));
    await C.deleteDealThread(dealId);
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  });

  it("runs a public channel: join, owner-only settings, private, leave", async () => {
    await as(ali);
    const g = await A.createGroup({ name: `${tag}-sales`, memberIds: [bina] });
    expect((await C.listOpenGroups(carl)).some((x) => x.id === g)).toBe(true);
    await as(carl);
    await A.joinGroup(g);
    expect((await C.listChannelsFor(carl)).find((c) => c.id === g)?.members).toHaveLength(3);

    await as(bina);
    await expect(A.updateGroup(g, { name: "renamed" })).rejects.toThrow(/owner or an admin/);
    await as(ali);
    await A.updateGroup(g, { name: `${tag}-team`, isPrivate: true });
    const forAli = (await C.listChannelsFor(ali)).find((c) => c.id === g)!;
    expect(forAli).toMatchObject({ name: `${tag}-team`, isPrivate: true, role: "owner" });
    expect((await C.listOpenGroups(boss)).some((x) => x.id === g)).toBe(false);

    // in a private channel only the owner or an admin brings people in
    await as(carl);
    await expect(A.addMembers(g, [boss])).rejects.toThrow(/owner or an admin/);
    await A.leaveGroup(g);
    expect((await C.listChannelsFor(carl)).some((c) => c.id === g)).toBe(false);
    await expect(A.sendMessage({ channelId: g, body: "still here?" })).rejects.toThrow(/not in it/);

    // the owner leaving hands the channel to the next member
    await as(ali);
    await A.leaveGroup(g);
    expect((await C.listChannelsFor(bina)).find((c) => c.id === g)?.role).toBe("owner");
  });

  it("opens a deal's thread to its team and to people who see every deal, and follows the team", async () => {
    await as(ali);
    const thread = await A.openDealThread(dealId);
    expect(thread).toMatchObject({ kind: "record", name: `${tag} 20 laptops`, record: { id: dealId, subtitle: `${tag} Trading` } });
    expect(thread.members.map((m) => m.id).sort()).toEqual([ali, bina].sort());
    // empty deal threads stay out of the list until someone writes
    expect((await C.listChannelsFor(ali)).some((c) => c.id === thread.id)).toBe(false);
    await A.sendMessage({ channelId: thread.id, body: "Customer wants delivery Sunday" });
    expect((await C.listChannelsFor(bina)).find((c) => c.id === thread.id)?.unread).toBe(1);

    await as(carl);
    await expect(A.openDealThread(dealId)).rejects.toThrow();
    await expect(A.sendMessage({ channelId: thread.id, body: "hi" })).rejects.toThrow(/not in it/);

    await as(boss, "admin");
    await A.openDealThread(dealId);
    expect(await C.memberIds(thread.id)).toContain(boss);

    // taking Bina off the deal takes her out of the thread; the admin stays
    await S.setAssignees(dealId, [ali]);
    const left = await C.memberIds(thread.id);
    expect(left).toContain(ali);
    expect(left).toContain(boss);
    expect(left).not.toContain(bina);
  });

  it("quotes, threads, reactions, edits and deletes", async () => {
    await as(ali);
    const dm = await A.startDm(bina);
    const root = await A.sendMessage({ channelId: dm, body: "Price for HP 840 G11?" });
    await as(bina);
    const quote = await A.sendMessage({ channelId: dm, body: "AED 3,950", replyToId: root.id });
    expect(quote.replyTo).toMatchObject({ id: root.id, body: "Price for HP 840 G11?" });
    const reply = await A.sendMessage({ channelId: dm, body: "From Mitsumi, 5 in stock", threadId: root.id });
    await expect(A.sendMessage({ channelId: dm, body: "nested", threadId: reply.id })).rejects.toThrow(/first message/);

    const thread = (await M.loadThread(root.id))!;
    expect(thread.root.replyCount).toBe(1);
    expect(thread.replies.map((r) => r.id)).toEqual([reply.id]);
    // thread replies stay out of the main conversation
    expect((await M.loadMessages(dm)).messages.map((m) => m.id)).toEqual([root.id, quote.id]);

    expect(await A.toggleReaction(root.id, "👍")).toEqual([{ emoji: "👍", userIds: [bina] }]);
    expect(await A.toggleReaction(root.id, "👍")).toEqual([]);
    await expect(A.toggleReaction(root.id, "lol")).rejects.toThrow();

    await expect(A.editMessage(root.id, "hacked")).rejects.toThrow(/your own/);
    await expect(A.deleteMessage(root.id)).rejects.toThrow(/your own/);
    await as(ali);
    const edited = await A.editMessage(root.id, "Price for HP 840 G11, 16 GB?");
    expect(edited.editedAt).not.toBeNull();
    await A.deleteMessage(root.id);
    const gone = (await M.getMessage(root.id))!;
    expect(gone).toMatchObject({ body: "", reactions: [] });
    expect(gone.deletedAt).not.toBeNull();
    // the quote of a deleted message says so
    expect((await M.getMessage(quote.id))!.replyTo).toMatchObject({ deleted: true, body: "" });
  });
});

// both groups share the pool and the LISTEN connection; close them once at the very end
afterAll(async () => {
  if (!live) return;
  const { pool } = await import("@/db");
  const { closeBus } = await import("@/lib/chat/bus");
  await closeBus();
  await pool.end();
});
