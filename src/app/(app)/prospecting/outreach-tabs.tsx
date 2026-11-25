"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
  /** Other paths that count as this tab. */
  also?: string[];
  exact?: boolean;
}

/**
 * Outreach keeps its sidebar to a few items; the pages behind each one are tabs here. Campaigns: cold email, emails to
 * approve, follow-up steps, newsletters, mailing lists, templates. Settings: mailboxes and AI, industries, sources, do
 * not contact. Prospects: the list and the import (admins).
 */
const GROUPS: { match: string[]; tabs: Tab[]; full?: boolean }[] = [
  {
    match: ["/prospecting/campaigns", "/prospecting/review", "/prospecting/sequences", "/newsletter"],
    full: true,
    tabs: [
      { href: "/prospecting/campaigns", label: "Cold email" },
      { href: "/prospecting/review", label: "To approve" },
      { href: "/prospecting/sequences", label: "Follow-up steps" },
      { href: "/newsletter", label: "Newsletters", also: ["/newsletter/campaigns"], exact: true },
      { href: "/newsletter/audiences", label: "Mailing lists" },
      { href: "/newsletter/templates", label: "Templates" },
    ],
  },
  {
    match: ["/prospecting/settings", "/prospecting/segments", "/prospecting/sources", "/prospecting/do-not-contact"],
    full: true,
    tabs: [
      { href: "/prospecting/settings", label: "Mailboxes and AI" },
      { href: "/prospecting/segments", label: "Industries" },
      { href: "/prospecting/sources", label: "Sources" },
      { href: "/prospecting/do-not-contact", label: "Do not contact" },
    ],
  },
  {
    match: ["/prospecting/import"],
    full: true,
    tabs: [
      { href: "/prospecting/prospects", label: "Prospects", exact: true },
      { href: "/prospecting/import", label: "Import a list" },
    ],
  },
];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function OutreachTabs({ full }: { full: boolean }) {
  const path = usePathname();
  const group = GROUPS.find((g) => g.match.some((m) => under(path, m)));
  if (!group || (group.full && !full)) return null;
  return (
    <nav aria-label="Section" className="-mb-1 flex gap-1 overflow-x-auto border-b text-sm">
      {group.tabs.map((t) => {
        const on = (t.exact ? path === t.href : under(path, t.href)) || !!t.also?.some((a) => under(path, a));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-2.5 py-1.5 whitespace-nowrap ${on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
