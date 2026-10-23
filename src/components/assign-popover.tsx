"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setAssignees } from "@/app/(app)/sales/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AvatarStack, UserAvatar } from "@/components/user-avatar";

type Person = { id: number; name: string };

/**
 * The people on a deal as stacked avatars; click to add or remove people. Changes save straight away.
 * The first person is the main owner, new people are added after them.
 * `readOnly` (people who only see their own deals): just the avatars, since only admins and managers share deals.
 */
export function AssignPopover({
  dealId,
  assignees,
  users,
  size = 24,
  max = 3,
  readOnly = false,
}: {
  dealId: number;
  assignees: Person[];
  users: Person[];
  size?: number;
  max?: number;
  readOnly?: boolean;
}) {
  const [ids, setIds] = useState<number[]>(assignees.map((a) => a.id));
  const [pending, start] = useTransition();

  const toggle = (id: number) => {
    const next = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
    const before = ids;
    setIds(next);
    start(async () => {
      try {
        await setAssignees(dealId, next);
      } catch (e) {
        setIds(before);
        toast.error((e as Error).message);
      }
    });
  };

  const current = ids.map((i) => users.find((u) => u.id === i) ?? assignees.find((a) => a.id === i)).filter((u): u is Person => !!u);
  if (readOnly) return <AvatarStack users={current} size={size} max={max} />;
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex cursor-pointer items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Change who works on this deal"
      >
        <AvatarStack users={current} size={size} max={max} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-1 p-1.5">
        <p className="px-2 pt-1 text-xs text-muted-foreground">Who works on this deal? The first is the main owner.</p>
        {users.map((u) => {
          const on = ids.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              disabled={pending}
              onClick={() => toggle(u.id)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
              aria-pressed={on}
            >
              <UserAvatar name={u.name} size={22} />
              <span className="flex-1 truncate">{u.name}</span>
              {on && ids[0] === u.id && <span className="text-[10px] text-muted-foreground">owner</span>}
              {on && <Check className="size-4 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
