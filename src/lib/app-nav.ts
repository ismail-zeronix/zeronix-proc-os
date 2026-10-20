import { Bell, ClipboardPaste, History, LayoutDashboard, Search, Truck, type LucideIcon } from "lucide-react";
import type { AppKey } from "./apps";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Name of a number in the `badges` map handed to the sidebar. */
  badge?: string;
  /** Match only this exact path (for an app's overview page). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar pages per app. Apps without an entry have no sidebar (single-page apps). */
export const APP_NAV: Partial<Record<AppKey, NavGroup[]>> = {
  procurement: [
    {
      label: "Work",
      items: [
        { href: "/procurement", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/procurement/compare", label: "Compare prices", icon: Search },
        { href: "/procurement/import", label: "Paste price list", icon: ClipboardPaste },
      ],
    },
    {
      label: "Track",
      items: [
        { href: "/procurement/alerts", label: "Price alerts", icon: Bell, badge: "alerts" },
        { href: "/procurement/price-lists", label: "Price lists", icon: History, badge: "review" },
        { href: "/procurement/suppliers", label: "Suppliers", icon: Truck },
      ],
    },
  ],
};

/** Hover text for a sidebar badge. */
export const BADGE_LABELS: Record<string, string> = {
  review: "waiting for review",
  alerts: "new this week",
};

/** Pages offered in the Ctrl K "Go to" list, for the apps the user may open. */
export function searchPages(apps: readonly AppKey[]) {
  return apps.flatMap((key) => (APP_NAV[key] ?? []).flatMap((g) => g.items.map((i) => ({ ...i, app: key }))));
}
