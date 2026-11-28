import { notFound, redirect } from "next/navigation";
import { SettingsNav } from "@/components/settings-ui";
import type { AppKey } from "@/lib/apps";
import { mySections } from "@/lib/settings/access";
import { settingsFolders } from "@/lib/settings/registry";

/**
 * The frame of every app's Settings: the tree of its sections on the left (lib/settings/registry.ts), the page on the
 * right (no tree when there is only one). Only the sections this person may change are listed; with none, the page
 * does not exist for them.
 */
export async function SettingsShell({ home, label, children }: { home: AppKey; label: string; children: React.ReactNode }) {
  const sections = await mySections(home);
  if (!sections.length) notFound();
  // one page needs no tree beside it
  if (sections.length === 1) return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">{children}</div>;
  return (
    <div className="grid min-w-0 items-start gap-3 md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <SettingsNav label={label} storageKey={`${home}-settings`} folders={settingsFolders(sections)} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">{children}</div>
    </div>
  );
}

/** For an app's /settings address: opens its first section. */
export async function openFirstSection(home: AppKey): Promise<never> {
  const [first] = await mySections(home);
  if (!first) notFound();
  redirect(first.href);
}
