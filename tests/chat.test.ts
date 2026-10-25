import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dmKey, mentionToken, parseMentions, parseRecordRefs, previewOf, recordToken, tokensToText } from "@/lib/chat/text";
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

  it("finds mentions and linked records, and keeps names from breaking the markup", () => {
    const body = `${mentionToken(3, "Bina [Sales]")} and ${mentionToken(9, "Carl")} again ${mentionToken(3, "Bina")}, see ${recordToken("quote:4", "ZQ-2026-0012")}`;
    expect(parseMentions(body)).toEqual([3, 9]);
    expect(parseRecordRefs(body)).toEqual(["quote:4"]);
    expect(tokensToText(body)).toBe("@Bina Sales and @Carl again @Bina, see ZQ-2026-0012");
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

describe.skipIf(!live)("mention cards (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let inArray: typeof import("drizzle-orm").inArray;
  let eq: typeof import("drizzle-orm").eq;
  let A: typeof import("@/app/(app)/chat/actions");
  let S: typeof import("@/app/(app)/sales/actions");
  let T: typeof import("@/app/(app)/tasks/actions");
  let K: typeof import("@/lib/chat/cards");
  let N: typeof import("@/lib/chat/mentions");
  let M: typeof import("@/lib/chat/messages");
  let session: typeof import("@/lib/auth/session");
  let ali: number, bina: number, carl: number, companyId: number, dealId: number;
  let userIds: number[] = [];
  const tag = `ZZCHAT3${Date.now()}`;

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  /** The cards in someone's Activity feed, oldest first. */
  const feed = async (userId: number) => (await M.loadMessages(await N.activityFeedOf(userId))).messages;
  const cardsFor = async (id: number, refs: string[]) => {
    await as(id);
    return K.resolveCards((await session.loadAccess())!, refs);
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    ({ inArray, eq } = await import("drizzle-orm"));
    A = await import("@/app/(app)/chat/actions");
    S = await import("@/app/(app)/sales/actions");
    T = await import("@/app/(app)/tasks/actions");
    K = await import("@/lib/chat/cards");
    N = await import("@/lib/chat/mentions");
    M = await import("@/lib/chat/messages");
    session = await import("@/lib/auth/session");
    const mk = async (name: string) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x" }).returning({ id: schema.users.id }))[0].id;
    ali = await mk("ali");
    bina = await mk("bina");
    carl = await mk("carl");
    userIds = [ali, bina, carl];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Trading`, nameNorm: `${tag}trading`.toLowerCase(), ownerId: ali }).returning({ id: schema.companies.id }))[0].id;
    dealId = (await db.insert(schema.deals).values({ title: `${tag} CCTV`, companyId, ownerId: ali, valueAed: 12500 }).returning({ id: schema.deals.id }))[0].id;
    await db.insert(schema.dealAssignees).values([
      { dealId, userId: ali, position: 0 },
      { dealId, userId: bina, position: 1 },
    ]);
  });

  afterAll(async () => {
    const ch = await db.select({ id: schema.chatMembers.channelId }).from(schema.chatMembers).where(inArray(schema.chatMembers.userId, userIds));
    if (ch.length) await db.delete(schema.chatChannels).where(inArray(schema.chatChannels.id, [...new Set(ch.map((c) => c.id))]));
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  });

  it("sends a deal card from the timeline to everyone mentioned, locked for those who cannot see the deal", async () => {
    await as(ali);
    await S.logActivity(dealId, { type: "call", body: `Customer wants 8 cameras ${mentionToken(bina, "Bina")} ${mentionToken(carl, "Carl")} please check stock` });
    const [forBina] = await feed(bina);
    expect(forBina).toMatchObject({ kind: "card", userId: ali, card: { type: "deal", id: dealId, event: "call" } });
    expect((await feed(carl))[0].card).toMatchObject({ type: "deal", id: dealId });
    // the author is never told about a mention of themselves
    expect(await feed(ali)).toHaveLength(0);

    const [binaCard] = await cardsFor(bina, [`deal:${dealId}`]);
    expect(binaCard).toMatchObject({ title: `${tag} CCTV`, subtitle: `${tag} Trading`, amount: "AED 12,500" });
    expect(binaCard.people?.map((p) => p.id)).toEqual([ali, bina]);
    const [carlCard] = await cardsFor(carl, [`deal:${dealId}`]);
    expect(carlCard).toMatchObject({ restricted: true, title: "" });
    expect(await K.whoCanSee({ type: "deal", id: dealId }, [bina, carl])).toEqual(new Set([bina]));
    // the timeline keeps the mention as a token, so it shows as a chip
    const [entry] = await db.select({ body: schema.activities.body }).from(schema.activities).where(eq(schema.activities.dealId, dealId)).limit(1);
    expect(entry.body).toContain(`(user:${bina})`);
  });

  it("cards chat mentions in channels for members only, never in DMs, and keeps Activity read-only", async () => {
    await as(ali);
    const g = await A.createGroup({ name: `${tag}-team`, memberIds: [bina] });
    const sent = await A.sendMessage({ channelId: g, body: `${mentionToken(bina, "Bina")} and ${mentionToken(carl, "Carl")} see ${recordToken(`deal:${dealId}`, "CCTV")}` });
    expect(sent.body).toContain("#[CCTV]");
    expect((await feed(bina)).at(-1)?.card).toMatchObject({ type: "chat", id: sent.id, event: "mention" });
    // Carl is not in the channel: no card for him
    expect((await feed(carl)).some((m) => m.card?.type === "chat")).toBe(false);
    const [chatCard] = await cardsFor(bina, [`chat:${sent.id}`]);
    expect(chatCard).toMatchObject({ title: `#${tag}-team`, channelId: g });

    await as(ali);
    const dm = await A.startDm(bina);
    const before = (await feed(bina)).length;
    await A.sendMessage({ channelId: dm, body: `${mentionToken(bina, "Bina")} quick one` });
    expect(await feed(bina)).toHaveLength(before);

    await as(bina);
    await expect(A.sendMessage({ channelId: await N.activityFeedOf(bina), body: "hello" })).rejects.toThrow(/Reply where/);
  });

  it("cards company notes and task notes; a task card opens for the people mentioned in it", async () => {
    await as(ali);
    await S.addCompanyNote(companyId, `Owner changed, ${mentionToken(bina, "Bina")} please update the contact`);
    expect((await feed(bina)).at(-1)?.card).toMatchObject({ type: "company", id: companyId, event: "company" });

    await T.createTask({ title: `${tag} call the site`, notes: `${mentionToken(carl, "Carl")} you know the guard` });
    const [task] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.createdBy, ali));
    expect((await feed(carl)).at(-1)?.card).toMatchObject({ type: "task", id: task.id });
    const [carlTask] = await cardsFor(carl, [`task:${task.id}`]);
    expect(carlTask.restricted).toBeUndefined();
    expect(carlTask.title).toBe(`${tag} call the site`);
    expect((await cardsFor(bina, [`task:${task.id}`]))[0].restricted).toBe(true);

    // editing the notes tells only the people newly mentioned
    const carlBefore = (await feed(carl)).length;
    await as(ali);
    await T.updateTask(task.id, { title: `${tag} call the site`, notes: `${mentionToken(carl, "Carl")} you know the guard, ${mentionToken(bina, "Bina")} too` });
    expect(await feed(carl)).toHaveLength(carlBefore);
    expect((await feed(bina)).at(-1)?.card).toMatchObject({ type: "task", id: task.id });
  });
});

describe.skipIf(!live)("status, mute, card buttons and search (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let inArray: typeof import("drizzle-orm").inArray;
  let eq: typeof import("drizzle-orm").eq;
  let A: typeof import("@/app/(app)/chat/actions");
  let T: typeof import("@/app/(app)/tasks/actions");
  let C: typeof import("@/lib/chat/channels");
  let K: typeof import("@/lib/chat/cards");
  let M: typeof import("@/lib/chat/messages");
  let P: typeof import("@/lib/chat/presence");
  let F: typeof import("@/lib/chat/search");
  let bus: typeof import("@/lib/chat/bus");
  let session: typeof import("@/lib/auth/session");
  let ali: number, bina: number, carl: number, companyId: number, dealId: number;
  let userIds: number[] = [];
  const tag = `ZZCHAT4${Date.now()}`;

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const cardFor = async (id: number, ref: string) => {
    await as(id);
    return (await K.resolveCards((await session.loadAccess())!, [ref]))[0];
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    ({ inArray, eq } = await import("drizzle-orm"));
    A = await import("@/app/(app)/chat/actions");
    T = await import("@/app/(app)/tasks/actions");
    C = await import("@/lib/chat/channels");
    K = await import("@/lib/chat/cards");
    M = await import("@/lib/chat/messages");
    P = await import("@/lib/chat/presence");
    F = await import("@/lib/chat/search");
    bus = await import("@/lib/chat/bus");
    session = await import("@/lib/auth/session");
    const mk = async (name: string) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x" }).returning({ id: schema.users.id }))[0].id;
    ali = await mk("ali");
    bina = await mk("bina");
    carl = await mk("carl");
    userIds = [ali, bina, carl];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Co`, nameNorm: `${tag}co`.toLowerCase(), ownerId: ali }).returning({ id: schema.companies.id }))[0].id;
    dealId = (await db.insert(schema.deals).values({ title: `${tag} switches`, companyId, ownerId: ali }).returning({ id: schema.deals.id }))[0].id;
    await db.insert(schema.dealAssignees).values({ dealId, userId: ali, position: 0 });
  });

  afterAll(async () => {
    const ch = await db.select({ id: schema.chatMembers.channelId }).from(schema.chatMembers).where(inArray(schema.chatMembers.userId, userIds));
    if (ch.length) await db.delete(schema.chatChannels).where(inArray(schema.chatChannels.id, [...new Set(ch.map((c) => c.id))]));
    await db.delete(schema.chatPrefs).where(inArray(schema.chatPrefs.userId, userIds));
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  });

  it("shows people online, away or on do not disturb, and ends a timed do-not-disturb by itself", async () => {
    const off = bus.subscribe(ali, () => {});
    try {
      expect((await P.presenceMap())[ali]).toBe("online");
      await P.reportAway(ali, true);
      expect((await P.presenceMap())[ali]).toBe("away");
      await as(ali);
      const prefs = await A.setChatPrefs({ status: "dnd", dndMinutes: 60 });
      expect(prefs.status).toBe("dnd");
      expect(Date.parse(prefs.dndUntil!)).toBeGreaterThan(Date.now() + 59 * 60_000);
      expect((await P.presenceMap())[ali]).toBe("dnd");
      await A.setChatPrefs({ sound: false });
      expect(await P.prefsOf(ali)).toMatchObject({ status: "dnd", sound: false, desktop: true });
      // a do-not-disturb whose time has passed reads as back to normal
      await db.update(schema.chatPrefs).set({ dndUntil: new Date(Date.now() - 1000) }).where(eq(schema.chatPrefs.userId, ali));
      expect((await P.prefsOf(ali)).status).toBe("auto");
      await P.reportAway(ali, false);
      expect((await P.presenceMap())[ali]).toBe("online");
    } finally {
      off();
    }
    expect((await P.presenceMap())[carl]).toBeUndefined();
  });

  it("mutes and unmutes a conversation for one person only", async () => {
    await as(ali);
    const dm = await A.startDm(bina);
    await A.setChannelMute(dm, 60);
    expect((await C.listChannelsFor(ali)).find((c) => c.id === dm)?.muted).toBe(true);
    expect((await C.listChannelsFor(bina)).find((c) => c.id === dm)?.muted).toBe(false);
    await A.setChannelMute(dm, 0);
    expect((await C.listChannelsFor(ali)).find((c) => c.id === dm)?.muted).toBe(false);
  });

  it("runs card buttons with the record's own rules and notes it in the conversation", async () => {
    await as(ali);
    await T.createTask({ title: `${tag} send the datasheet`, notes: "" });
    const [task] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.createdBy, ali));
    const ref = `task:${task.id}`;
    expect((await cardFor(ali, ref)).actions).toEqual([{ key: "done", label: "Mark done" }]);
    // someone who cannot change the task gets no button, and the action refuses them
    expect((await cardFor(bina, ref)).restricted).toBe(true);
    await as(bina);
    await expect(A.runCardAction(ref, "done")).rejects.toThrow();

    await as(ali);
    const dm = await A.startDm(bina);
    const after = await A.runCardAction(ref, "done", dm);
    expect(after).toMatchObject({ status: { label: "Done" }, actions: [{ key: "reopen", label: "Reopen" }] });
    const lines = (await M.loadMessages(dm)).messages;
    expect(lines.at(-1)).toMatchObject({ kind: "system", userId: null });
    expect(lines.at(-1)?.body).toContain("marked the task done");

    // a follow-up from a deal card is a task for tomorrow on that deal
    await A.runCardAction(`deal:${dealId}`, "followup");
    const [follow] = await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, dealId));
    expect(follow).toMatchObject({ title: `Follow up: ${tag} switches`, relatedType: "deal", assignedTo: ali });
    await expect(A.runCardAction(ref, "explode")).rejects.toThrow(/does not work/);
  });

  it("searches only the conversations you are in, taking % literally", async () => {
    await as(ali);
    const g = await A.createGroup({ name: `${tag}-private`, memberIds: [bina], isPrivate: true });
    await A.sendMessage({ channelId: g, body: `${tag} margin is 15% on the HP order` });
    const hits = await F.searchMessages(bina, `${tag} margin`);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ channelId: g, channelName: `#${tag}-private` });
    expect(await F.searchMessages(carl, `${tag} margin`)).toHaveLength(0);
    expect(await F.searchMessages(bina, "15% on")).toHaveLength(1);
    expect(await F.searchMessages(bina, `${tag}%HP`)).toHaveLength(0);
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
