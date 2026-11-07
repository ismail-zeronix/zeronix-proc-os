import { Percent, ShoppingCart, BadgeCheck, Boxes, FileMinus, Factory, Newspaper, Tags, Ban, BarChart3, ClipboardCheck, ListOrdered, Send, Database, Target, Upload, Globe, Inbox, MessagesSquare, Landmark, ListTree, NotebookPen, TriangleAlert, Bell, FolderKanban, Bot, Building2, ClipboardList, FileText, HandCoins, History, Kanban, LayoutDashboard, Receipt, ReceiptText, Search, SlidersHorizontal, Truck, Users, UsersRound, SearchCheck, Wallet, type LucideIcon } from "lucide-react";
import type { AppKey } from "./apps";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Name of a number in the `badges` map handed to the sidebar. */
  badge?: string;
  /** Match only this exact path (for an app's overview page). */
  exact?: boolean;
  /** Other paths whose pages (`/procurement/import/3`) belong to this item, so it stays lit there. */
  also?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Shown only to users with this extra permission (see NavPerms). */
  need?: keyof NavPerms;
  /** A group of one obvious page needs no header above it. */
  hideLabel?: boolean;
}

/** Extra permissions inside an app that hide whole sidebar groups from the others. */
export interface NavPerms {
  /** The Accountant switch (Admin › Users): journals, chart of accounts, tax codes. */
  accountant?: boolean;
}

/** Sidebar pages per app. Apps without an entry have no sidebar (single-page apps). */
export const APP_NAV: Partial<Record<AppKey, NavGroup[]>> = {
  chat: [
    {
      label: "Chat",
      items: [
        { href: "/chat", label: "Team chats", icon: MessagesSquare, exact: true, badge: "chatUnread" },
        { href: "/chat/website", label: "Website chats", icon: Globe, badge: "webWaiting" },
      ],
    },
  ],
  crm: [
    {
      label: "Work",
      items: [
        { href: "/crm", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/crm/leads", label: "Leads", icon: Inbox, also: ["/crm/new"] },
        { href: "/crm/deals", label: "Deals", icon: Kanban },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/crm/companies", label: "Companies", icon: Building2 },
        { href: "/crm/contacts", label: "Contacts", icon: Users },
      ],
    },
  ],
  website: [
    {
      label: "Website",
      items: [
        { href: "/website", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/website/content", label: "Content", icon: Newspaper },
        { href: "/website/seo", label: "SEO plan", icon: SearchCheck },
        { href: "/website/leads", label: "Leads", icon: Inbox, badge: "leads" },
        { href: "/website/orders", label: "Orders", icon: ShoppingCart, badge: "orders" },
        { href: "/website/pages", label: "Pages", icon: FileText },
      ],
    },
    {
      label: "Catalog",
      items: [
        { href: "/website/products", label: "Products", icon: Boxes },
        { href: "/website/industries", label: "Industries", icon: Factory },
        { href: "/website/categories", label: "Categories", icon: Tags },
        { href: "/website/brands", label: "Brands", icon: BadgeCheck },
      ],
    },
    {
      label: "Setup",
      items: [{ href: "/website/settings", label: "Settings", icon: SlidersHorizontal }],
    },
  ],
  prospecting: [
    {
      label: "Work",
      items: [
        { href: "/prospecting", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/prospecting/prospects", label: "Prospects", icon: Building2 },
        { href: "/prospecting/review", label: "Review", icon: ClipboardCheck, badge: "review" },
        { href: "/prospecting/campaigns", label: "Campaigns", icon: Send },
        { href: "/prospecting/import", label: "Import", icon: Upload },
      ],
    },
    {
      label: "Setup",
      items: [
        { href: "/prospecting/sequences", label: "Sequences", icon: ListOrdered },
        { href: "/prospecting/sources", label: "Sources", icon: Database },
        { href: "/prospecting/segments", label: "Segments", icon: Target },
        { href: "/prospecting/do-not-contact", label: "Do not contact", icon: Ban },
        { href: "/prospecting/settings", label: "Settings", icon: SlidersHorizontal },
      ],
    },
  ],
  projects: [
    {
      label: "Work",
      items: [
        { href: "/projects", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/projects/list", label: "Projects", icon: FolderKanban, badge: "projOverdue" },
      ],
    },
  ],
  procurement: [
    {
      label: "Work",
      items: [
        { href: "/procurement", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/procurement/compare", label: "Compare prices", icon: Search, also: ["/procurement/products"] },
        { href: "/procurement/price-lists", label: "Price lists", icon: History, badge: "review", also: ["/procurement/import"] },
      ],
    },
    {
      label: "Track",
      items: [
        { href: "/procurement/alerts", label: "Price alerts", icon: Bell, badge: "alerts" },
        { href: "/procurement/suppliers", label: "Suppliers", icon: Truck },
      ],
    },
  ],
  sales: [
    {
      label: "Sales",
      items: [
        { href: "/sales", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/sales/customers", label: "Customers", icon: UsersRound },
        { href: "/sales/quotes", label: "Quotes", icon: FileText, also: ["/sales/quotes/new"] },
        { href: "/sales/orders", label: "Sales orders", icon: ClipboardList },
      ],
    },
  ],
  accounts: [
    {
      label: "Overview",
      hideLabel: true,
      items: [{ href: "/accounts", label: "Overview", icon: LayoutDashboard, exact: true }],
    },
    {
      label: "Sales",
      items: [
        { href: "/accounts/customers", label: "Customers", icon: UsersRound },
        { href: "/accounts/quotes", label: "Quotes", icon: FileText },
        { href: "/accounts/orders", label: "Sales orders", icon: ClipboardList },
        { href: "/accounts/to-invoice", label: "To invoice", icon: Landmark, badge: "toInvoice" },
        { href: "/accounts/invoices", label: "Invoices", icon: Receipt, badge: "overdue" },
        { href: "/accounts/credit-notes", label: "Credit notes", icon: FileMinus },
        { href: "/accounts/payments", label: "Payments received", icon: Wallet },
      ],
    },
    {
      label: "Purchases",
      items: [
        { href: "/accounts/suppliers", label: "Suppliers", icon: Truck },
        { href: "/accounts/bills", label: "Bills", icon: ReceiptText, badge: "billsDue" },
        { href: "/accounts/debit-notes", label: "Debit notes", icon: FileMinus },
        { href: "/accounts/expenses", label: "Expenses", icon: HandCoins },
        { href: "/accounts/payments-made", label: "Payments made", icon: Wallet },
      ],
    },
    {
      label: "Accounting",
      need: "accountant",
      items: [
        { href: "/accounts/vat", label: "VAT return", icon: Percent },
        { href: "/accounts/journals", label: "Journal entries", icon: NotebookPen },
        { href: "/accounts/chart", label: "Chart of accounts", icon: ListTree },
        { href: "/accounts/closing-stock", label: "Closing stock", icon: Boxes },
      ],
    },
    {
      label: "Reports",
      items: [{ href: "/accounts/reports", label: "Reports", icon: BarChart3 }],
    },
    {
      label: "Settings",
      need: "accountant",
      items: [{ href: "/accounts/settings", label: "Accounts settings", icon: SlidersHorizontal }],
    },
  ],
  admin: [
    {
      label: "Team",
      items: [
        { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/admin/users", label: "Users", icon: Users },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/ai", label: "AI & feeds", icon: Bot, badge: "queue" },
        { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
        { href: "/admin/errors", label: "Errors", icon: TriangleAlert },
      ],
    },
  ],
};

/** The sidebar groups of an app, without the groups this user lacks the permission for. */
export function navFor(app: AppKey, perms: NavPerms = {}): NavGroup[] {
  return (APP_NAV[app] ?? []).filter((g) => !g.need || perms[g.need]);
}

/** Hover text for a sidebar badge. */
export const BADGE_LABELS: Record<string, string> = {
  review: "waiting for review",
  alerts: "new this week",
  queue: "price lists waiting for AI",
  overdue: "invoices overdue",
  toInvoice: "delivered sales orders waiting for an invoice",
  billsDue: "supplier bills due this week or overdue",
  // Projects
  projOverdue: "projects with an overdue task",
  // Chat
  chatUnread: "unread messages",
  webWaiting: "website visitors waiting or unread",
};

/** Pages offered in the Ctrl K "Go to" list, for the apps the user may open. */
export function searchPages(apps: readonly AppKey[], perms: NavPerms = {}) {
  return apps.flatMap((key) => navFor(key, perms).flatMap((g) => g.items.map((i) => ({ ...i, app: key }))));
}
