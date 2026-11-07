"use client";

import { TreeNav } from "@/components/tree-nav";

export interface NavReport {
  key: string;
  label: string;
  hint: string;
  href: string;
}

/** The list of reports as a tree of folders: searchable, with stars for the ones you use most. */
export function ReportNav({ groups, current }: { groups: { label: string; reports: NavReport[] }[]; current: string }) {
  return <TreeNav label="Reports" storageKey="reports" search="Find a report" stars current={current} folders={groups.map((g) => ({ label: g.label, items: g.reports }))} />;
}
