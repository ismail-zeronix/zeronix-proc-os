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
  let pool: typeof import("@/db").pool;
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
    ({ db, schema, pool } = await import("@/db"));
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
    await bus.closeBus();
    await pool.end();
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
