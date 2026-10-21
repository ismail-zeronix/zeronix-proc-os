import { createAvatar } from "@dicebear/core";
import * as initialsStyle from "@dicebear/initials";

/** Mid-dark tones: white initials stay readable on every one of them. */
const PALETTE = ["2563eb", "0f766e", "b45309", "7c3aed", "be185d", "0369a1", "4d7c0f", "b91c1c"];

const cache = new Map<string, string>();

/** A clean initials avatar made by DiceBear: same name, same colour, every time. Cached because lists repeat people. */
function dataUri(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const uri = createAvatar(initialsStyle, {
    seed: name || "?",
    chars: 2,
    backgroundColor: PALETTE,
    backgroundType: ["solid"],
    textColor: ["ffffff"],
    fontWeight: 600,
    fontSize: 42,
  }).toDataUri();
  cache.set(name, uri);
  return uri;
}

/** One person. `size` is in pixels. */
export function UserAvatar({ name, size = 28, className = "", style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUri(name)}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-full bg-muted object-cover ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/**
 * Overlapping avatars for a deal's team: the main owner on top, up to `max` faces, then "+N".
 * Reads as one unit; the title lists everybody.
 */
export function AvatarStack({ users, max = 3, size = 24, className = "" }: { users: { id: number; name: string }[]; max?: number; size?: number; className?: string }) {
  if (!users.length) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
        title="Nobody assigned"
        aria-label="Nobody assigned"
      >
        ?
      </span>
    );
  }
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const all = users.map((u) => u.name).join(", ");
  return (
    <span className={`inline-flex items-center ${className}`} title={all} aria-label={`Assigned to ${all}`}>
      {shown.map((u, i) => (
        <UserAvatar key={u.id} name={u.name} size={size} className="relative -ml-1.5 ring-2 ring-card first:ml-0" style={{ zIndex: shown.length - i }} />
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-card"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
