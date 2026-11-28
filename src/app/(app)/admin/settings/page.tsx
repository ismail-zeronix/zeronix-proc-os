import { redirect } from "next/navigation";
import { openFirstSection } from "@/components/settings-shell";

/** Where the old tabs (?tab=…) went, so bookmarks and links in chats still land on the right page. */
const OLD_TABS: Record<string, string> = {
  hours: "/admin/settings/hours",
  targets: "/crm/settings/targets",
  documents: "/admin/settings/templates",
  projects: "/projects/settings/types",
  comparison: "/procurement/settings/comparison",
  notifications: "/admin/settings/notifications",
  branding: "/admin/settings/company",
  data: "/admin/settings/data",
};

export default async function AdminSettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const { tab } = await searchParams;
  const to = typeof tab === "string" ? OLD_TABS[tab] : undefined;
  if (to) redirect(to);
  return openFirstSection("admin");
}
