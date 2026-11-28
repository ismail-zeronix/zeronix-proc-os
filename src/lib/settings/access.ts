import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { AppKey } from "@/lib/apps";
import { loadAccess, requireAccess, type Access } from "@/lib/auth/session";
import { zeronixFeatures } from "@/lib/edition";
import { canSeeSection, sectionByKey, sectionsFor, settingsApps, type SettingsSection, type SettingsViewer } from "./registry";

export function viewerOfAccess(a: Access): SettingsViewer {
  return { apps: a.apps, admin: a.user.role === "admin", accountant: a.accountant, trader: a.trader, zeronix: zeronixFeatures() };
}

/** The signed-in person as a settings viewer, once per request. Null = not signed in. */
export const settingsViewer = cache(async (): Promise<SettingsViewer | null> => {
  const a = await loadAccess();
  return a ? viewerOfAccess(a) : null;
});

/** Apps whose sidebar shows a Settings item for this person. */
export async function mySettingsApps(): Promise<AppKey[]> {
  const v = await settingsViewer();
  return v ? settingsApps(v) : [];
}

/** The sections of one app's Settings this person sees. */
export async function mySections(home: AppKey): Promise<SettingsSection[]> {
  const v = await settingsViewer();
  return v ? sectionsFor(v, home) : [];
}

/** For a settings page: the person must be allowed this section, otherwise it looks like the page does not exist. */
export async function requireSettings(key: string): Promise<Access> {
  const access = await requireAccess();
  if (!canSeeSection(sectionByKey(key), viewerOfAccess(access))) notFound();
  return access;
}
