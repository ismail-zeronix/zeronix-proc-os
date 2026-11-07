import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { Pager } from "@/components/pager";
import { PAGE_SIZES, type ListState } from "@/lib/list-params";

type Sp = Record<string, string | string[] | undefined>;

function hrefWith(path: string, sp: Sp, patch: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k in patch) continue;
    for (const one of Array.isArray(v) ? v : [v]) if (one !== "") q.append(k, one);
  }
  for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** A column heading that sorts its list. The first press sorts down, the next up; a new sort starts on page one. */
export function SortHead({ label, col, path, sp, list, align }: { label: string; col: string; path: string; sp: Sp; list: ListState; align?: "right" }) {
  const on = list.sort === col;
  const next = on && list.dir === "desc" ? "asc" : "desc";
  const Icon = !on ? ArrowUpDown : list.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={hrefWith(path, sp, { sort: col, dir: next, page: null })}
      scroll={false}
      aria-label={`Sort by ${label}`}
      className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""} ${on ? "text-foreground" : ""}`}
    >
      {label}
      <Icon className={`size-3 shrink-0 ${on ? "" : "opacity-40"}`} />
    </Link>
  );
}

/** The one pager of every list: where you are, previous and next, and how many rows a page shows. */
export function ListPager({ path, sp, list, total }: { path: string; sp: Sp; list: ListState; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {total > PAGE_SIZES[0] && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Rows per page">
          Show
          {PAGE_SIZES.map((n) => (
            <Link
              key={n}
              href={hrefWith(path, sp, { size: n === 50 ? null : String(n), page: null })}
              scroll={false}
              aria-current={list.size === n ? "true" : undefined}
              className={`rounded px-1.5 py-0.5 tabular-nums hover:bg-muted ${list.size === n ? "bg-muted font-medium text-foreground" : ""}`}
            >
              {n}
            </Link>
          ))}
        </span>
      )}
      <Pager path={path} params={sp} page={list.page} total={total} pageSize={list.size} showSingle />
    </div>
  );
}
