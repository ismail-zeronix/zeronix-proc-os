/** Projects rules in one place: work statuses, the phase a project is in, and its number. Safe for client components. */

/** What happens on site once the deal is won. */
export const PROJECT_STATUSES = [
  { key: "not_started", label: "Not started", hint: "Won, work not begun" },
  { key: "in_progress", label: "In progress", hint: "Work on site" },
  { key: "on_hold", label: "On hold", hint: "Waiting for the customer, material or site access" },
  { key: "completed", label: "Completed", hint: "Work finished, handover done" },
  { key: "closed", label: "Closed", hint: "Signed off and paid" },
  { key: "cancelled", label: "Cancelled", hint: "Stopped after it was won" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["key"];
export const isProjectStatus = (k: string): k is ProjectStatus => PROJECT_STATUSES.some((s) => s.key === k);
export const projectStatusLabel = (k: string) => PROJECT_STATUSES.find((s) => s.key === k)?.label ?? k;

/**
 * Where a project is, as one word for grouping lists and the dashboard. Before the deal is won it is a lead (or quoted);
 * a lost deal is lost; after that the work status decides.
 */
export const PHASES = [
  { key: "lead", label: "Leads" },
  { key: "quoted", label: "Quoted" },
  { key: "won", label: "To start" },
  { key: "active", label: "In progress" },
  { key: "done", label: "Completed" },
  { key: "dropped", label: "Lost / cancelled" },
] as const;

export type Phase = (typeof PHASES)[number]["key"];

export function projectPhase(dealStage: string, status: string): Phase {
  if (dealStage === "lost") return "dropped";
  if (dealStage !== "won") return dealStage === "quoted" || dealStage === "negotiation" ? "quoted" : "lead";
  if (status === "cancelled") return "dropped";
  if (status === "completed" || status === "closed") return "done";
  if (status === "in_progress" || status === "on_hold") return "active";
  return "won";
}

export const phaseLabel = (k: string) => PHASES.find((p) => p.key === k)?.label ?? k;

/** ZPJ-2026-0001 */
export function projectNumber(year: number, seq: number): string {
  return `ZPJ-${year}-${String(seq).padStart(4, "0")}`;
}

/** The checklist of a project, in three groups. Survey dates count from the day the project was opened; the others from its start date. */
export const CHECKLIST_GROUPS = [
  { key: "survey", label: "Survey & proposal", from: "opened" },
  { key: "work", label: "Work on site", from: "start" },
  { key: "handover", label: "Handover", from: "start" },
] as const;

export type ChecklistGroup = (typeof CHECKLIST_GROUPS)[number]["key"];
export const isChecklistGroup = (k: string): k is ChecklistGroup => CHECKLIST_GROUPS.some((g) => g.key === k);
export const checklistGroupLabel = (k: string) => CHECKLIST_GROUPS.find((g) => g.key === k)?.label ?? k;

/**
 * The due day of a checklist task made from a template: `offset` days after the day the project was opened (survey) or
 * after its start date (work, handover). Null when there is no offset, or the start date is not set yet.
 */
export function checklistDue(group: string, offset: number | null, openedDay: string, startDate: string | null): string | null {
  if (offset == null) return null;
  const from = CHECKLIST_GROUPS.find((g) => g.key === group)?.from === "opened" ? openedDay : startDate;
  if (!from) return null;
  return new Date(Date.parse(from + "T00:00:00Z") + offset * 86400_000).toISOString().slice(0, 10);
}
