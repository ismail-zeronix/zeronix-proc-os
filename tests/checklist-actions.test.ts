import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The actions read the session cookie and ask Next to refresh pages. Here the cookie is ours to set, and refreshing is a no-op.
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

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("project checklist (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;
  let and: typeof import("drizzle-orm").and;
  let S: typeof import("@/app/(app)/sales/actions");
  let P: typeof import("@/app/(app)/projects/actions");
  let C: typeof import("@/app/(app)/projects/checklist-actions");
  let A: typeof import("@/app/(app)/admin/project-type-actions");
  let D: typeof import("@/lib/projects-data");
  let T: typeof import("@/lib/tasks");
  let dates: typeof import("@/lib/dates");
  let userIds: number[] = [];
  let seller: number, mate: number, outsider: number, boss: number;
  const tag = `ZZCHK${Date.now()}`;

  const as = async (id: number, name: string, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name, email: `${name}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, inArray, and } = await import("drizzle-orm"));
    S = await import("@/app/(app)/sales/actions");
    P = await import("@/app/(app)/projects/actions");
    C = await import("@/app/(app)/projects/checklist-actions");
    A = await import("@/app/(app)/admin/project-type-actions");
    D = await import("@/lib/projects-data");
    T = await import("@/lib/tasks");
    dates = await import("@/lib/dates");
    const mk = async (name: string, role: "admin" | "sales") =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", "sales");
    mate = await mk("mate", "sales");
    outsider = await mk("outsider", "sales");
    boss = await mk("boss", "admin");
    userIds = [seller, mate, outsider, boss];
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dates.dubaiToday() })));
  });

  afterAll(async () => {
    const cs = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);
    const ids = cs.filter((c) => c.name.includes(tag)).map((c) => c.id);
    if (ids.length) {
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, ids));
      const projects = deals.length ? await db.select({ id: schema.projects.id }).from(schema.projects).where(inArray(schema.projects.dealId, deals.map((d) => d.id))) : [];
      // only these deals' follow-ups and these projects' checklists: a project id can equal some real deal's id
      if (deals.length) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
      if (projects.length) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "project"), inArray(schema.tasks.relatedId, projects.map((p) => p.id))));
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids));
    }
    await db.delete(schema.projectTypes).where(eq(schema.projectTypes.label, `${tag} Solar`));
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  let projectId: number, dealId: number;
  const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

  it("a new project gets its type's checklist, survey dated from today, work undated until the start date", async () => {
    await as(seller, "seller");
    const r = await S.createEnquiry({ companyName: `${tag} Clinic`, requirement: "12 doors", kind: "project", projectType: "access_control", ownerIds: [seller] });
    projectId = r.projectId!;
    dealId = r.id;
    const list = await D.checklistOf(projectId);
    const templates = await db.select().from(schema.projectTaskTemplates).where(eq(schema.projectTaskTemplates.typeKey, "access_control"));
    expect(list).toHaveLength(templates.length);
    expect(list.every((t) => t.assignedTo === seller)).toBe(true);
    const survey = list.find((t) => t.title.startsWith("Site survey"))!;
    expect(survey.dueDate).toBe(addDays(dates.dubaiToday(), 1));
    expect(list.filter((t) => t.group === "work").every((t) => t.dueDate === null)).toBe(true);
    expect(list.some((t) => t.required)).toBe(true);
  });

  it("setting the start date dates the work, except dates picked by hand", async () => {
    await as(seller, "seller");
    const list = await D.checklistOf(projectId);
    const install = list.find((t) => t.title.startsWith("Install readers"))!;
    const fireTest = list.find((t) => t.title === "Fire alarm release test")!;
    await C.updateChecklistTask(fireTest.id, { dueDate: "2027-01-15" });
    await P.updateProjectDetails(projectId, { siteAddress: "", siteMapUrl: "", startDate: "2026-12-01", targetDate: "", notes: "", managerId: seller });
    let after = await D.checklistOf(projectId);
    expect(after.find((t) => t.id === install.id)?.dueDate).toBe("2026-12-05");
    expect(after.find((t) => t.id === fireTest.id)?.dueDate).toBe("2027-01-15");
    await P.updateProjectDetails(projectId, { siteAddress: "", siteMapUrl: "", startDate: "2026-12-10", targetDate: "", notes: "", managerId: seller });
    after = await D.checklistOf(projectId);
    expect(after.find((t) => t.id === install.id)?.dueDate).toBe("2026-12-14");
  });

  it("the sidebar badge counts projects with an overdue checklist task", async () => {
    const before = (await D.projectsBadges({ id: seller, seesAll: false })).projOverdue;
    const [t] = await D.checklistOf(projectId);
    await as(seller, "seller");
    await C.updateChecklistTask(t.id, { dueDate: "2020-01-01" });
    expect((await D.projectsBadges({ id: seller, seesAll: false })).projOverdue).toBe(before + 1);
    expect((await D.projectsBadges({ id: outsider, seesAll: false })).projOverdue).toBe(0);
    await C.updateChecklistTask(t.id, { dueDate: "" });
  });

  it("the team shares the checklist; outsiders cannot touch it; tasks go to team members only", async () => {
    await as(seller, "seller");
    const [first] = await D.checklistOf(projectId);
    await expect(C.updateChecklistTask(first.id, { assignedTo: mate })).rejects.toThrow(/project team/);
    await db.insert(schema.dealAssignees).values({ dealId, userId: mate, position: 1 });
    await C.updateChecklistTask(first.id, { assignedTo: mate });
    // a team mate may tick a task given to someone else
    await as(mate, "mate");
    await C.setChecklistDone(first.id, true);
    expect((await D.checklistOf(projectId)).find((t) => t.id === first.id)?.status).toBe("done");
    // and it shows in their own task list, linked to the project
    const mine = await T.listTasks({ userId: mate });
    const row = mine.done.find((t) => t.id === first.id);
    expect(row?.relatedType).toBe("project");
    expect(row?.relatedTitle).toContain("Clinic");
    await as(outsider, "outsider");
    await expect(C.setChecklistDone(first.id, false)).rejects.toThrow(/not assigned/);
    await expect(C.addChecklistTask(projectId, { group: "work", title: "x" })).rejects.toThrow(/not assigned/);
  });

  it("adds, moves and removes tasks; adding the type checklist again only fills gaps", async () => {
    await as(seller, "seller");
    await C.addChecklistTask(projectId, { group: "handover", title: "Hand over spare cards", required: true });
    const handover = (await D.checklistOf(projectId)).filter((t) => t.group === "handover").sort((a, b) => a.position - b.position);
    const added = handover.at(-1)!;
    expect(added.title).toBe("Hand over spare cards");
    await C.moveChecklistTask(added.id, "up");
    const moved = (await D.checklistOf(projectId)).filter((t) => t.group === "handover").sort((a, b) => a.position - b.position);
    expect(moved.at(-2)?.id).toBe(added.id);
    const before = (await D.checklistOf(projectId)).length;
    expect(await C.addTypeChecklist(projectId)).toBe(0);
    const removed = (await D.checklistOf(projectId)).find((t) => t.title === "Admin training")!;
    await C.deleteChecklistTask(removed.id);
    expect(await C.addTypeChecklist(projectId)).toBe(1);
    expect((await D.checklistOf(projectId)).length).toBe(before);
  });

  it("an admin edits types, sections and the starting checklist", async () => {
    await as(seller, "seller");
    await expect(A.addProjectType(`${tag} Solar`)).rejects.toThrow(/Admin/);
    await as(boss, "boss", "admin");
    const key = await A.addProjectType(`${tag} Solar`);
    await A.saveProjectType(key, { label: `${tag} Solar`, isActive: true, defaultSections: ["Panels", " panels ", "", "Inverter", "Mounting"] });
    const [type] = await db.select().from(schema.projectTypes).where(eq(schema.projectTypes.key, key));
    expect(type.defaultSections).toEqual(["Panels", "Inverter", "Mounting"]);
    await A.addTemplate(key, "survey", "Roof survey");
    await A.addTemplate(key, "handover", "Grid connection approval");
    const [tpl] = await db.select().from(schema.projectTaskTemplates).where(eq(schema.projectTaskTemplates.typeKey, key));
    await A.updateTemplate(tpl.id, { title: "Roof and shading survey", offsetDays: 2, required: false });
    // a new project of that type starts with those sections and tasks
    await as(seller, "seller");
    const r = await S.createEnquiry({ companyName: `${tag} Farm`, requirement: "rooftop solar", kind: "project", projectType: key });
    const p = await D.getProject(r.projectId!, { id: seller, seesAll: false });
    expect(p?.boqSections).toEqual(["Panels", "Inverter", "Mounting"]);
    const list = await D.checklistOf(r.projectId!);
    expect(list.map((t) => t.title).sort()).toEqual(["Grid connection approval", "Roof and shading survey"]);
    expect(list.find((t) => t.title.startsWith("Roof"))?.dueDate).toBe(addDays(dates.dubaiToday(), 2));
  });

  it("deleting the deal removes the project checklist", async () => {
    await as(seller, "seller");
    const r = await S.createEnquiry({ companyName: `${tag} Shop`, requirement: "cameras", kind: "project", projectType: "cctv" });
    expect((await D.checklistOf(r.projectId!)).length).toBeGreaterThan(0);
    await S.deleteDeal(r.id);
    const left = await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, r.projectId!));
    expect(left.filter((t) => t.relatedType === "project")).toHaveLength(0);
  });
});
