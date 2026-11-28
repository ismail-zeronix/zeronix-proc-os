import { asc } from "drizzle-orm";
import { ProjectTypeSettings } from "@/app/(app)/admin/projects-ui";
import { db, schema } from "@/db";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Project types · Projects settings" };

/** Kinds of project work, the BOQ sections each starts with, and their task lists. */
export default async function ProjectTypesPage() {
  await requireSettings("project-types");
  const [types, templates] = await Promise.all([
    db.select().from(schema.projectTypes).orderBy(asc(schema.projectTypes.position), asc(schema.projectTypes.label)),
    db.select().from(schema.projectTaskTemplates),
  ]);
  return <ProjectTypeSettings types={types} templates={templates} />;
}
