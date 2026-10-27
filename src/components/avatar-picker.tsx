"use client";

import { UserAvatar } from "@/components/user-avatar";

type Person = { id: number; name: string };

/** Pick several people by clicking their avatars. The first one picked is the main owner. */
export function AvatarPicker({ users, value, onChange }: { users: Person[]; value: number[]; onChange: (ids: number[]) => void }) {
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Assign to">
      {users.map((u) => {
        const on = value.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            aria-pressed={on}
            title={`${u.name}${on && value[0] === u.id ? " (owner)" : ""}`}
            className={`relative rounded-full transition ${on ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-45 hover:opacity-100"}`}
          >
            <UserAvatar name={u.name} size={30} />
            {on && value[0] === u.id && value.length > 1 && (
              <span className="absolute -right-1 -bottom-1 rounded-full bg-primary px-1 text-[8px] leading-3 text-primary-foreground">1</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
