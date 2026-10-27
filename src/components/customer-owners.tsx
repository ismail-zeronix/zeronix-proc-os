"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setCustomerOwners } from "@/app/(app)/sales/customer-actions";
import { ContextMenuCheckboxItem } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AvatarStack, UserAvatar } from "@/components/user-avatar";

export type Person = { id: number; name: string };

/**
 * A customer's owners with optimistic saving: tick a person to add them, untick to remove. The first is the main owner;
 * new people are added after the others.
 */
export function useCustomerOwners(companyId: number, initial: Person[], users: Person[]) {
  const [ids, setIds] = useState<number[]>(initial.map((o) => o.id));
  const [pending, start] = useTransition();
  const toggle = (id: number) => {
    const before = ids;
    const next = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
    setIds(next);
    start(async () => {
      try {
        await setCustomerOwners(companyId, next);
      } catch (e) {
        setIds(before);
        toast.error((e as Error).message);
      }
    });
  };
  const owners = ids.map((i) => users.find((u) => u.id === i) ?? initial.find((o) => o.id === i)).filter((u): u is Person => !!u);
  return { ids, owners, toggle, pending };
}

export type OwnersState = ReturnType<typeof useCustomerOwners>;

function OwnerRow({ user, state }: { user: Person; state: OwnersState }) {
  return (
    <>
      <UserAvatar name={user.name} size={20} />
      <span className="flex-1 truncate">{user.name}</span>
      {state.ids[0] === user.id && <span className="text-[10px] text-muted-foreground">main</span>}
    </>
  );
}

/** The owner tick list inside a right-click menu. */
export function OwnerContextItems({ users, state }: { users: Person[]; state: OwnersState }) {
  return users.map((u) => (
    <ContextMenuCheckboxItem key={u.id} checked={state.ids.includes(u.id)} disabled={state.pending} onCheckedChange={() => state.toggle(u.id)}>
      <OwnerRow user={u} state={state} />
    </ContextMenuCheckboxItem>
  ));
}

/**
 * Stacked owner avatars; people who may change owners (admins, "All data") click them to pick owners from a menu.
 * Everyone else just sees the avatars.
 */
export function OwnersDropdown({ users, state, canEdit, size = 24, max = 3 }: { users: Person[]; state: OwnersState; canEdit: boolean; size?: number; max?: number }) {
  if (!canEdit) return <AvatarStack users={state.owners} size={size} max={max} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex cursor-pointer items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Change who owns this customer"
        title={state.owners.length ? `Owners: ${state.owners.map((o) => o.name).join(", ")}` : "No owner yet"}
      >
        <AvatarStack users={state.owners} size={size} max={max} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Owners · the first is the main owner</DropdownMenuLabel>
          {users.map((u) => (
            <DropdownMenuCheckboxItem key={u.id} checked={state.ids.includes(u.id)} disabled={state.pending} onCheckedChange={() => state.toggle(u.id)}>
              <OwnerRow user={u} state={state} />
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Owner avatars for one customer's page, with the owner menu for people who may change it. */
export function CustomerOwnersMenu({ companyId, owners, users, canEdit }: { companyId: number; owners: Person[]; users: Person[]; canEdit: boolean }) {
  const state = useCustomerOwners(companyId, owners, users);
  return <OwnersDropdown users={users} state={state} canEdit={canEdit} size={28} max={4} />;
}
