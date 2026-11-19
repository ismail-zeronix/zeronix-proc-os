import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const live = !!process.env.DATABASE_URL;
const tag = `nlt${Date.now()}`;
const em = (n: string) => `${n}.${tag}@example.test`;

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("unsubscribe tokens", () => {
  it("accepts its own token and rejects a changed one", async () => {
    process.env.AUTH_SECRET ||= "test-secret-test-secret-test-secret";
    const { unsubscribeToken, readUnsubscribeToken } = await import("@/lib/newsletter/token");
    const t = unsubscribeToken(42);
    expect(readUnsubscribeToken(t)).toBe(42);
    expect(readUnsubscribeToken(t.replace(/^42\./, "43."))).toBeNull();
    expect(readUnsubscribeToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(readUnsubscribeToken("garbage")).toBeNull();
    expect(readUnsubscribeToken(unsubscribeToken(0))).toBe(0);
  });
});

describe.skipIf(!live)("newsletter lists, queue and unsubscribe", () => {
  let db: any, schema: any, D: any, N: any, S: any, U: any;
  let listId = 0;
  let mailboxId = 0;

  beforeAll(async () => {
    process.env.AUTH_SECRET ||= "test-secret-test-secret-test-secret";
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    N = await import("@/lib/newsletter/data");
    S = await import("@/lib/newsletter/send");
    U = await import("@/lib/newsletter/unsubscribe");
    listId = (await db.insert(schema.newsletterLists).values({ name: `${tag} list` }).returning({ id: schema.newsletterLists.id }))[0].id;
    mailboxId = (
      await db.insert(schema.outreachMailboxes).values({ email: `box.${tag}@example.test`, passwordEnc: "x", enabled: true, lastTestOk: true }).returning({ id: schema.outreachMailboxes.id })
    )[0].id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.newsletterCampaigns).where(D.like(schema.newsletterCampaigns.name, `${tag}%`));
    await db.delete(schema.newsletterLists).where(D.eq(schema.newsletterLists.id, listId));
    await db.delete(schema.outreachSuppression).where(D.like(schema.outreachSuppression.value, `%${tag}%`));
    await db.delete(schema.outreachMailboxes).where(D.eq(schema.outreachMailboxes.id, mailboxId));
  });

  it("adds contacts, marks do-not-contact addresses as unsubscribed and ignores the 'customer' reason", async () => {
    await db.insert(schema.outreachSuppression).values([
      { value: em("optout"), kind: "email", reason: "unsubscribe" },
      { value: em("bounced"), kind: "email", reason: "bounce" },
      { value: em("customer"), kind: "email", reason: "customer" },
    ]);
    const r = await N.addContacts(listId, [em("ok"), em("optout"), em("bounced"), em("customer"), em("ok"), "nonsense"].join("\n"), "test");
    expect(r).toMatchObject({ added: 4, blocked: 2, invalid: ["nonsense"] });
    expect(r.duplicates).toBe(1);
    const rows = await db.select().from(schema.newsletterContacts).where(D.eq(schema.newsletterContacts.listId, listId));
    const status = Object.fromEntries(rows.map((c: any) => [c.email, c.status]));
    expect(status[em("ok")]).toBe("active");
    expect(status[em("customer")]).toBe("active");
    expect(status[em("optout")]).toBe("unsubscribed");
    expect(status[em("bounced")]).toBe("bounced");
    // adding the same text again adds nobody
    expect((await N.addContacts(listId, em("ok"), "test")).added).toBe(0);
  });

  it("queues active contacts, skips recently mailed ones, and finishes a campaign with nobody to send to", async () => {
    const mk = async (name: string) =>
      (
        await db
          .insert(schema.newsletterCampaigns)
          .values({ name: `${tag} ${name}`, templateKey: "intro", subject: "Hello there", listId, fields: { values: {}, productIds: [] } })
          .returning({ id: schema.newsletterCampaigns.id })
      )[0].id;
    const first = await mk("first");
    expect(await S.startCampaign(first)).toEqual({ queued: 2, skipped: 0 });
    await expect(S.startCampaign(first)).rejects.toThrow(/already been started/);

    // one of them was mailed a moment ago: the second campaign skips them (cool-off is 7 days by default)
    await db.update(schema.newsletterSends).set({ status: "sent", sentAt: new Date() }).where(D.and(D.eq(schema.newsletterSends.campaignId, first), D.eq(schema.newsletterSends.email, em("ok"))));
    const second = await mk("second");
    expect(await S.startCampaign(second)).toEqual({ queued: 1, skipped: 1 });
    const skipped = await db.select().from(schema.newsletterSends).where(D.and(D.eq(schema.newsletterSends.campaignId, second), D.eq(schema.newsletterSends.status, "skipped")));
    expect(skipped[0].skipReason).toMatch(/Mailed within the last/);
  });

  it("unsubscribes through the link: stops the address everywhere and is safe to repeat", async () => {
    const [send] = await db.select().from(schema.newsletterSends).where(D.eq(schema.newsletterSends.email, em("customer")));
    const { unsubscribeToken } = await import("@/lib/newsletter/token");
    const token = unsubscribeToken(send.id);
    expect(await U.unsubscribe(token, false)).toMatchObject({ ok: true, email: em("customer") });
    // opening the link alone changes nothing
    expect((await N.blockedMap([em("customer")])).size).toBe(0);
    await U.unsubscribe(token, true);
    await U.unsubscribe(token, true);
    expect((await N.blockedMap([em("customer")])).get(em("customer"))).toBe("unsubscribed");
    const [c] = await db.select().from(schema.newsletterContacts).where(D.eq(schema.newsletterContacts.email, em("customer")));
    expect(c.status).toBe("unsubscribed");
    expect(await U.unsubscribe("1.notavalidsignaturenotvalid1", true)).toEqual({ ok: false });
  });
});
