import {
  BookOpen,
  Handshake,
  ListChecks,
  PackageSearch,
  Radar,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type Role = "admin" | "sales";

export interface AppDef {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line shown under the name on the home tile. */
  blurb: string;
  /** Roles that get this app when the admin has not picked a custom list for the user. */
  defaultFor: readonly Role[];
  /** "soon" apps have no pages yet: shown greyed, to admins only. */
  status: "live" | "soon";
  /** CSS variable (see globals.css) used to colour the tile icon. */
  color: string;
}

/** Single source of truth for the portal's apps. Add an app = add a row here + a folder under src/app/(app)/. */
export const APPS = [
  {
    key: "procurement",
    label: "Procurement",
    href: "/procurement",
    icon: PackageSearch,
    blurb: "Compare supplier prices",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-1)",
  },
  {
    key: "sales",
    label: "Sales",
    href: "/sales",
    icon: Handshake,
    blurb: "Leads, deals and quotes",
    defaultFor: ["admin", "sales"],
    status: "soon",
    color: "var(--series-3)",
  },
  {
    key: "tasks",
    label: "Tasks",
    href: "/tasks",
    icon: ListChecks,
    blurb: "What to do today",
    defaultFor: ["admin", "sales"],
    status: "soon",
    color: "var(--series-4)",
  },
  {
    key: "knowledge",
    label: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
    blurb: "Hardware guide and sales playbook",
    defaultFor: ["admin", "sales"],
    status: "soon",
    color: "var(--series-7)",
  },
  {
    key: "accounts",
    label: "Accounts",
    href: "/accounts",
    icon: Receipt,
    blurb: "Invoices and payments",
    defaultFor: ["admin"],
    status: "soon",
    color: "var(--series-2)",
  },
  {
    key: "prospecting",
    label: "Prospecting",
    href: "/prospecting",
    icon: Radar,
    blurb: "Find new businesses",
    defaultFor: ["admin"],
    status: "soon",
    color: "var(--series-5)",
  },
  {
    key: "admin",
    label: "Admin",
    href: "/admin",
    icon: Settings,
    blurb: "Users, AI and settings",
    defaultFor: ["admin"],
    status: "live",
    color: "var(--series-8)",
  },
] as const satisfies readonly AppDef[];

export type AppKey = (typeof APPS)[number]["key"];

/** Apps whose access an admin can switch per user (admin-only apps are not offered to sales users). */
export const GRANTABLE_APPS = APPS.filter((a) => a.key !== "admin");

const KEYS = new Set<string>(APPS.map((a) => a.key));
export const isAppKey = (k: string): k is AppKey => KEYS.has(k);

export interface AccessUser {
  role: Role;
  /** null/undefined = use the role defaults; otherwise the admin's explicit list. */
  apps?: readonly string[] | null;
}

/** Which apps the user may open. Admins always get everything. */
export function allowedApps(user: AccessUser): AppKey[] {
  if (user.role === "admin") return APPS.map((a) => a.key);
  if (user.apps) return APPS.filter((a) => a.key !== "admin" && user.apps!.includes(a.key)).map((a) => a.key);
  return APPS.filter((a) => (a.defaultFor as readonly Role[]).includes(user.role)).map((a) => a.key);
}

/** Apps to show as tiles / in the switcher: live ones the user may open, plus "coming soon" ones for admins only. */
export function visibleApps(user: AccessUser): AppDef[] {
  const allowed = new Set<string>(allowedApps(user));
  return APPS.filter((a) => allowed.has(a.key) && (a.status === "live" || user.role === "admin"));
}

export const canOpen =(user: AccessUser, key: AppKey) => allowedApps(user).includes(key);

export function appByKey(key: AppKey): AppDef {
  return APPS.find((a) => a.key === key)!;
}
