"use client";

import { AlertTriangle, Building2, Copy, ExternalLink, FilePlus2, Mail, Phone, Repeat, ScrollText, Sparkles, Star, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OwnerContextItems, OwnersDropdown, useCustomerOwners, type Person } from "@/components/customer-owners";
import { Empty } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AvatarStack } from "@/components/user-avatar";
import type { CustomerRow } from "@/lib/accounts-data";
import { dayLabel } from "@/lib/dates";
import { longDay, money } from "@/lib/quotation";
import { aedShort } from "@/lib/sales";

export type Flag = "top" | "new" | "repeat" | "noTrn" | "noContact";

const FLAGS: Record<Flag, { label: string; icon: typeof Star; cls: string; title: string }> = {
  top: { label: "Top", icon: Star, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", title: "One of the biggest customers by sales orders" },
  new: { label: "New", icon: Sparkles, cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400", title: "Became a customer in the last 30 days" },
  repeat: { label: "Repeat", icon: Repeat, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", title: "Ordered more than once" },
  noTrn: { label: "No TRN", icon: AlertTriangle, cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400", title: "Save their TRN before the tax invoice" },
  noContact: { label: "No contact", icon: UserRound, cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300", title: "Nobody saved at this company yet" },
};

/** Small label badges on a customer, always an icon and a word. */
function Flags({ flags }: { flags: Flag[] }) {
  return flags.map((f) => {
    const { label, icon: Icon, cls, title } = FLAGS[f];
    return (
      <Badge key={f} variant="secondary" className={`h-4.5 px-1.5 text-[10px] ${cls}`} title={title}>
        <Icon className="size-3!" /> {label}
      </Badge>
    );
  });
}

export type CustomerListRow = CustomerRow & { flags: Flag[] };

interface Props {
  rows: CustomerListRow[];
  users: Person[];
  /** Admins and "All data" users change owners. */
  canEdit: boolean;
  crm: boolean;
  today: string;
  empty: string;
}

/**
 * Customers as a dense list. Right-click a row (or long-press on a phone) for its actions and owners; owners can also be
 * changed from the avatars.
 */
export function CustomersTable({ rows, users, canEdit, crm, today, empty }: Props) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border bg-card">
        <Empty>{empty}</Empty>
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Owners</TableHead>
              <TableHead>In progress</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Owes</TableHead>
              <TableHead className="hidden xl:table-cell">Last paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <CustomerTableRow key={c.id} c={c} users={users} canEdit={canEdit} crm={crm} today={today} />
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:hidden">
        {rows.map((c) => (
          <CustomerCard key={c.id} c={c} users={users} canEdit={canEdit} crm={crm} today={today} />
        ))}
      </ul>
    </>
  );
}

type RowProps = { c: CustomerListRow; users: Person[]; canEdit: boolean; crm: boolean; today: string };

/** "Yesterday" or "Mon 19 Oct" for the last week, else the full date. */
function when(day: string, today: string) {
  return Math.abs(Date.parse(day) - Date.parse(today)) < 7 * 86400_000 ? dayLabel(day, today) : longDay(day);
}

function details(c: CustomerRow) {
  return [c.industry, c.emirate, c.trn ? `TRN ${c.trn}` : ""].filter(Boolean).join(" · ") || "No details yet";
}

function CustomerTableRow({ c, users, canEdit, crm, today }: RowProps) {
  const state = useCustomerOwners(c.id, c.owners, users);
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<TableRow />} className="select-auto data-popup-open:bg-muted/60">
        <TableCell className="max-w-80 py-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Link href={`/sales/customers/${c.id}`} className="truncate font-medium hover:underline">
              {c.name}
            </Link>
            <Flags flags={c.flags} />
          </div>
          <div className="truncate text-xs text-muted-foreground">{details(c)}</div>
        </TableCell>
        <TableCell className="max-w-56 py-1.5">
          {c.contact ? (
            <>
              <div className="truncate text-sm" title={c.contact.jobTitle || undefined}>
                {c.contact.name}
                {c.contacts > 1 && <span className="text-xs text-muted-foreground"> +{c.contacts - 1}</span>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{c.contact.phone || c.contact.email || c.contact.jobTitle || "-"}</div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell className="py-1.5">
          <OwnersDropdown users={users} state={state} canEdit={canEdit} />
        </TableCell>
        <TableCell className="py-1.5 text-xs">
          <Progress c={c} />
        </TableCell>
        <TableCell className="py-1.5 text-right">
          {c.orders ? (
            <>
              <div className="tabular-nums">{aedShort(c.sales)}</div>
              <div className="text-xs text-muted-foreground">
                {c.orders} sales order{c.orders === 1 ? "" : "s"}
                {c.lastOrder && ` · ${when(c.lastOrder, today)}`}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No sales orders yet</span>
          )}
        </TableCell>
        <TableCell className="py-1.5 text-right">
          <div className="font-medium tabular-nums">{c.owed ? money(c.owed) : "-"}</div>
          {c.overdue > 0 && <div className="text-xs font-medium text-red-700 tabular-nums dark:text-red-400">{money(c.overdue)} overdue</div>}
        </TableCell>
        <TableCell className="hidden py-1.5 text-xs xl:table-cell">{c.lastPaid ? when(c.lastPaid, today) : "-"}</TableCell>
      </ContextMenuTrigger>
      <RowMenu c={c} users={users} canEdit={canEdit} crm={crm} state={state} />
    </ContextMenu>
  );
}

/** What is going on right now: open deals, quotes waiting for an answer, orders to deliver. */
function Progress({ c }: { c: CustomerRow }) {
  const bits = [
    c.openDeals ? `${c.openDeals} open deal${c.openDeals === 1 ? "" : "s"}` : "",
    c.openQuotes ? `${c.openQuotes} quote${c.openQuotes === 1 ? "" : "s"} waiting · ${aedShort(c.openQuotesValue)}` : "",
    c.toDeliver ? `${c.toDeliver} to deliver` : "",
  ].filter(Boolean);
  if (!bits.length) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="grid gap-0.5">
      {bits.map((b) => (
        <span key={b} className="truncate">
          {b}
        </span>
      ))}
    </div>
  );
}

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error("Could not copy"),
  );
}

function RowMenu({ c, users, canEdit, crm, state }: Omit<RowProps, "today"> & { state: ReturnType<typeof useCustomerOwners> }) {
  const router = useRouter();
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuGroup>
        <ContextMenuLabel className="truncate">{c.name}</ContextMenuLabel>
        <ContextMenuItem onClick={() => router.push(`/sales/customers/${c.id}`)}>
          <Building2 /> Open customer
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuItem onClick={() => router.push(`/sales/quotes/new?company=${c.id}`)}>
        <FilePlus2 /> New quote
      </ContextMenuItem>
      <ContextMenuItem onClick={() => router.push(`/sales/customers/${c.id}?tab=statement`)}>
        <ScrollText /> Statement
      </ContextMenuItem>
      {crm && (
        <ContextMenuItem onClick={() => router.push(`/crm/companies/${c.id}`)}>
          <ExternalLink /> Contacts and deals in CRM
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <UsersRound /> Owners
          {state.owners.length > 0 && <AvatarStack users={state.owners} size={16} max={3} className="ml-auto" />}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-56">
          <ContextMenuGroup>
            {canEdit ? (
              <>
                <ContextMenuLabel>The first is the main owner</ContextMenuLabel>
                <OwnerContextItems users={users} state={state} />
              </>
            ) : (
              <ContextMenuLabel className="whitespace-normal">
                {state.owners.length ? state.owners.map((o) => o.name).join(", ") : "No owner yet"}. Only an admin changes owners.
              </ContextMenuLabel>
            )}
          </ContextMenuGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => copy(c.name, "Name")}>
        <Copy /> Copy name
      </ContextMenuItem>
      {c.trn && (
        <ContextMenuItem onClick={() => copy(c.trn, "TRN")}>
          <Copy /> Copy TRN
        </ContextMenuItem>
      )}
      {c.contact?.phone && (
        <ContextMenuItem onClick={() => copy(c.contact!.phone, "Phone")}>
          <Phone /> Copy phone
        </ContextMenuItem>
      )}
      {c.contact?.email && (
        <ContextMenuItem onClick={() => copy(c.contact!.email, "Email")}>
          <Mail /> Copy email
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  );
}

/** Phone layout: one card per customer; long-press opens the same menu. */
function CustomerCard({ c, users, canEdit, crm }: RowProps) {
  const state = useCustomerOwners(c.id, c.owners, users);
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<li />} className="select-auto rounded-lg border bg-card p-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/sales/customers/${c.id}`} className="block truncate text-sm font-medium">
              {c.name}
            </Link>
            <div className="truncate text-xs text-muted-foreground">{details(c)}</div>
          </div>
          <OwnersDropdown users={users} state={state} canEdit={canEdit} size={22} />
        </div>
        {c.flags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            <Flags flags={c.flags} />
          </div>
        )}
        <div className="mt-1.5 flex items-end gap-2 text-xs">
          <div className="min-w-0 flex-1 text-muted-foreground">
            <Progress c={c} />
          </div>
          <div className="text-right">
            {c.owed || c.orders ? (
              <>
                <div className="text-sm font-medium tabular-nums">{c.owed ? money(c.owed) : aedShort(c.sales)}</div>
                <div className={c.overdue ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                  {c.overdue ? `${money(c.overdue)} overdue` : c.owed ? "owes us" : `${c.orders} sales order${c.orders === 1 ? "" : "s"}`}
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">No sales orders yet</span>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <RowMenu c={c} users={users} canEdit={canEdit} crm={crm} state={state} />
    </ContextMenu>
  );
}
