import {
  BookOpen,
  FolderKanban,
  FolderOpen,
  Globe,
  Handshake,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  PackageSearch,
  Radar,
  Receipt,
  Settings,
  ShoppingCart,
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
  /** Every active user has it; not one of the apps an admin switches per user. */
  always?: boolean;
  /** Lives inside another app (no tile, not in the switcher) but is still switched on per user, e.g. Newsletter in Outreach. */
  inside?: string;
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
    key: "crm",
    label: "CRM",
    href: "/crm",
    icon: Handshake,
    blurb: "Leads, deals, companies",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-3)",
  },
  {
    // owns customers (companies once a deal is won), quotes and sales orders; CRM owns leads and deals, Accounts the money
    key: "sales",
    label: "Sales",
    href: "/sales",
    icon: ShoppingCart,
    blurb: "Customers, quotes, orders",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-6)",
  },
  {
    key: "projects",
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
    blurb: "Proposals, site work, handover",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--app-projects)",
  },
  {
    key: "tasks",
    label: "Tasks",
    href: "/tasks",
    icon: ListChecks,
    blurb: "What to do today",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-4)",
  },
  {
    // team chat and website visitors; for everyone (the chat button is on every page too)
    key: "chat",
    label: "Chat",
    href: "/chat",
    icon: MessageCircle,
    blurb: "Team and website chats",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--app-chat)",
    always: true,
  },
  {
    key: "mail",
    label: "Mail",
    href: "/mail",
    icon: Mail,
    blurb: "Read and write email",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-6)",
  },
  {
    key: "knowledge",
    label: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
    blurb: "Hardware guide and sales playbook",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-7)",
  },
  {
    key: "files",
    label: "Files",
    href: "/files",
    icon: FolderOpen,
    blurb: "Shared company documents",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-5)",
  },
  {
    key: "accounts",
    label: "Accounts",
    href: "/accounts",
    icon: Receipt,
    blurb: "Invoices, payments, bills, reports",
    // the money: admins, plus whoever the admin gives this app to (the accounts person)
    defaultFor: ["admin"],
    status: "live",
    color: "var(--series-2)",
  },
  {
    // Outreach (Phase 5 of the sales routine): finding customers, cold calls, cold email and newsletters in one app.
    // The key stays "prospecting" so saved access lists and links keep working. Salesmen work their own prospects.
    key: "prospecting",
    label: "Outreach",
    href: "/prospecting",
    icon: Radar,
    blurb: "Find customers, cold calls, email and newsletters",
    defaultFor: ["admin", "sales"],
    status: "live",
    color: "var(--series-5)",
  },
  {
    // ready-made newsletters to pasted lists, sent from the Prospecting mailboxes with a working unsubscribe link
    key: "newsletter",
    label: "Newsletters",
    href: "/newsletter",
    icon: Megaphone,
    blurb: "Send newsletters to your lists (inside Outreach)",
    defaultFor: ["admin"],
    status: "live",
    color: "var(--series-4)",
    inside: "prospecting",
  },
  {
    // control panel of the public site zeronixtech.com (WEBSITE-PLAN.md): content, catalog, leads, analytics
    key: "website",
    label: "Website",
    href: "/website",
    icon: Globe,
    blurb: "zeronixtech.com content and analytics",
    defaultFor: ["admin"],
    status: "live",
    color: "var(--series-3)",
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
export const GRANTABLE_APPS = APPS.filter((a) => a.key !== "admin" && !("always" in a));

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
  if (user.apps) return APPS.filter((a) => a.key !== "admin" && ("always" in a || user.apps!.includes(a.key))).map((a) => a.key);
  return APPS.filter((a) => (a.defaultFor as readonly Role[]).includes(user.role)).map((a) => a.key);
}

/**
 * The app tiles and menu entries to show. Pass the apps the person may open as loadAccess() resolved them (role,
 * their own list and the organisation's plan): an admin of a SaaS organisation sees only what its plan includes.
 * Live apps only, plus "coming soon" ones for admins.
 */
export function visibleApps(user: AccessUser): AppDef[] {
  const allowed = new Set<string>(user.apps ?? allowedApps(user));
  return APPS.filter((a) => allowed.has(a.key) && !("inside" in a) && (a.status === "live" || user.role === "admin"));
}

export const canOpen =(user: AccessUser, key: AppKey) => allowedApps(user).includes(key);

export function appByKey(key: AppKey): AppDef {
  return APPS.find((a) => a.key === key)!;
}

/** The app a portal path belongs to (`/crm/deals/3` → Sales); undefined for Home and pages outside the apps. */
export function appOfPath(path: string): AppDef | undefined {
  return APPS.find((a) => path === a.href || path.startsWith(a.href + "/") || path.startsWith(a.href + "?"));
}

/**
 * The apps a SaaS organisation gets (demo.zeronixos.online, v1): CRM, Sales, Accounts, Projects, Tasks, Files and Chat
 * (attendance is part of every account). Procurement, Mail, Knowledge, Outreach, Newsletters and Website are Zeronix's
 * own (lib/edition.ts): the platform console cannot switch them on for an organisation.
 */
export const TENANT_CORE_APPS: AppKey[] = ["crm", "sales", "accounts", "projects", "tasks", "files", "chat"];

/** Tile text in the SaaS install, where an app's Zeronix-only parts are off (Chat has no website chats, Admin no Claude). */
export const TENANT_BLURBS: Partial<Record<string, string>> = { chat: "Team chats", admin: "Users and settings" };

/**
 * Which of a person's apps their organisation's plan allows. `orgApps` is organizations.enabled_apps (null = no list
 * saved). On Zeronix's own install null means every app; in the SaaS install (`zeronix` false) the plan can never go
 * beyond TENANT_CORE_APPS, and null means all of those. Admin always stays for an organisation's admins.
 */
export function planApps(apps: AppKey[], orgApps: string[] | null, zeronix: boolean): AppKey[] {
  const plan = zeronix ? orgApps : (orgApps ?? TENANT_CORE_APPS).filter((a) => (TENANT_CORE_APPS as string[]).includes(a));
  return apps.filter((a) => !plan || a === "admin" || plan.includes(a));
}
