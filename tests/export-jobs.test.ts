import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportPriority, extensionOf, fileNameOf, isExportUrl } from "@/lib/export-urls";

vi.mock("server-only", () => ({}));

describe("what may go through the queue", () => {
  it("takes our download addresses", () => {
    for (const u of ["/api/reports/pdf?r=pl&period=this-year", "/api/reports?r=gl&format=xlsx", "/api/accounts/export?list=invoices&ids=1,2&format=csv", "/api/documents/receipt/5/pdf", "/api/documents/invoice/5/pdf?doc=credit", "/api/quotes/7/pdf", "/api/projects/proposals/3/pdf", "/api/export?q=lenovo"]) expect(isExportUrl(u)).toBe(true);
  });

  it("refuses anything else: other sites, other pages, odd characters", () => {
    for (const u of ["https://evil.example/x", "//evil.example/api/reports", "/api/admin/users", "/api/reports/../admin", "/accounts", "/api/quotes/7/pdf?x=1", "/api/reports?r=<x>", "", null, 5, `/api/reports?r=${"a".repeat(5000)}`]) expect(isExportUrl(u)).toBe(false);
  });

  it("puts one document ahead of a report", () => {
    expect(exportPriority("/api/documents/receipt/5/pdf")).toBeLessThan(exportPriority("/api/accounts/export?list=bills"));
    expect(exportPriority("/api/accounts/export?list=bills")).toBeLessThan(exportPriority("/api/reports?r=gl&format=xlsx"));
  });

  it("reads the file name and type", () => {
    expect(fileNameOf(`attachment; filename="a.pdf"`)).toBe("a.pdf");
    expect(fileNameOf(`attachment; filename="_.pdf"; filename*=UTF-8''%D8%A7.pdf`)).toBe("ا.pdf");
    expect(fileNameOf(null, "fallback")).toBe("fallback");
    expect(extensionOf("application/pdf", "x")).toBe("pdf");
    expect(extensionOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x")).toBe("xlsx");
    expect(extensionOf("text/csv; charset=utf-8", "x")).toBe("csv");
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("the queue", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let J: typeof import("@/lib/export-jobs");
  let D: typeof import("drizzle-orm");
  let me = 0, other = 0;
  const tag = `ZZEX${Date.now()}`;
  const ok = (body: string, type = "text/csv", name = "report.csv") => new Response(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"` } });

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    J = await import("@/lib/export-jobs");
    D = await import("drizzle-orm");
    await db.delete(schema.exportJobs);
    const mk = async (n: string) => (await db.insert(schema.users).values({ name: `${tag}${n}`, email: `${tag}${n}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"] }).returning({ id: schema.users.id }))[0].id;
    me = await mk("a");
    other = await mk("b");
  });
  afterAll(async () => {
    await db.update(schema.exportJobs).set({ finishedAt: new Date(0), status: "failed" });
    await J.cleanExportJobs();
  });

  it("makes files one by one, a document before a report that was asked for first", async () => {
    const report = await J.addExportJob(me, 1, "/api/reports?r=gl&format=xlsx", "General ledger");
    const doc = await J.addExportJob(other, 1, "/api/documents/receipt/5/pdf", "Receipt");
    expect(report?.ahead).toBe(0);
    expect(doc?.ahead).toBe(0); // it goes first
    const first = await J.takeNextExport();
    expect(first?.id).toBe(doc?.job.id);
    expect(first?.status).toBe("queued" === first?.status ? "x" : "running");
    const second = await J.takeNextExport();
    expect(second?.id).toBe(report?.job.id);
    expect(await J.takeNextExport()).toBeNull();
    await J.requeueInterrupted();
    expect((await J.myExportJobs(me))[0].status).toBe("queued");
    await J.takeNextExport();
    await J.takeNextExport();
  });

  it("does not add the same file twice while it is on its way, and limits how many", async () => {
    const a = await J.addExportJob(me, 1, "/api/reports?r=pl&format=csv", "P and L");
    const again = await J.addExportJob(me, 1, "/api/reports?r=pl&format=csv", "P and L");
    expect(again?.duplicate).toBe(true);
    expect(again?.job.id).toBe(a?.job.id);
    expect(again?.ahead).toBeGreaterThan(0); // the one being made is ahead of it
    for (let i = 0; i < J.MAX_ACTIVE_PER_PERSON; i++) await J.addExportJob(me, 1, `/api/reports?r=pl&format=csv&n=${i}`, "x");
    expect(await J.addExportJob(me, 1, "/api/reports?r=bs&format=csv", "x")).toBeNull();
    await db.update(schema.exportJobs).set({ status: "failed", finishedAt: new Date(0), claimedAt: new Date() });
    await J.cleanExportJobs();
    expect(await db.select().from(schema.exportJobs)).toEqual([]);
  });

  it("opens the address as the person who asked, stores the file, and only they can have it", async () => {
    await J.addExportJob(me, 1, "/api/reports?r=vat&format=csv", "VAT");
    const job = (await J.takeNextExport())!;
    let cookie = "";
    await J.runExportJob(job, (async (_u: string, init: RequestInit) => {
      cookie = String((init.headers as Record<string, string>).cookie);
      return ok("a,b\n1,2\n");
    }) as unknown as typeof fetch);
    expect(cookie).toMatch(/^zp_session=/);
    const { verifySession } = await import("@/lib/auth/token");
    expect((await verifySession(cookie.split("=")[1]))?.id).toBe(me);
    expect(await J.exportFile(other, job.id)).toBeNull();
    const f = await J.exportFile(me, job.id);
    expect(f?.data.toString()).toBe("a,b\n1,2\n");
    expect(f?.job.fileName).toBe("report.csv");
  });

  it("lets one tab pick it up, and another person none", async () => {
    const [done] = (await J.myExportJobs(me)).filter((x) => x.status === "done");
    expect(await J.claimExportJob(other, done.id)).toBe(false);
    expect(await J.claimExportJob(me, done.id)).toBe(true);
    expect(await J.claimExportJob(me, done.id)).toBe(false);
    expect((await J.myExportJobs(me)).some((x) => x.id === done.id)).toBe(false);
    // it can still be fetched again for a day
    expect((await J.exportFile(me, done.id))?.data.length).toBeGreaterThan(0);
  });

  it("keeps a failure for the person in plain words, with nothing from inside the system", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await J.addExportJob(me, 1, "/api/reports?r=cash&format=csv", "Cash");
    const bad = (await J.takeNextExport())!;
    await J.runExportJob(bad, (async () => new Response("secret stack trace", { status: 500 })) as unknown as typeof fetch);
    const [row] = await db.select().from(schema.exportJobs).where(D.eq(schema.exportJobs.id, bad.id));
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/could not be made/);
    expect(row.error).not.toMatch(/secret/);
    expect(await J.exportFile(me, bad.id)).toBeNull();
    vi.restoreAllMocks();
  });

  it("will not make a file for someone who has left", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.update(schema.users).set({ isActive: false }).where(D.eq(schema.users.id, other));
    await J.addExportJob(other, 1, "/api/quotes/7/pdf", "Quote");
    const job = (await J.takeNextExport())!;
    const fetcher = vi.fn();
    await J.runExportJob(job, fetcher as unknown as typeof fetch);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await db.select().from(schema.exportJobs).where(D.eq(schema.exportJobs.id, job.id)))[0].status).toBe("failed");
    vi.restoreAllMocks();
  });

  it("clears old files and gives up on a stuck job", async () => {
    await J.addExportJob(me, 1, "/api/reports?r=audit&format=csv", "Audit");
    const stuck = (await J.takeNextExport())!;
    await db.update(schema.exportJobs).set({ startedAt: new Date(Date.now() - 3600_000) }).where(D.eq(schema.exportJobs.id, stuck.id));
    await J.cleanExportJobs();
    expect((await db.select().from(schema.exportJobs).where(D.eq(schema.exportJobs.id, stuck.id)))[0].status).toBe("failed");
    await db.update(schema.exportJobs).set({ finishedAt: new Date(Date.now() - 25 * 3600_000) });
    await J.cleanExportJobs();
    expect(await db.select().from(schema.exportJobs)).toEqual([]);
  });
});
