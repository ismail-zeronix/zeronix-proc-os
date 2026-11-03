import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/** Page size for list pages. */
export const PAGE_SIZE = 50;

/** The 1-based page asked for in `?page=`, never below 1. */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/**
 * "51-100 of 340" with previous / next links. Keeps the other search params (filters) in the links, so paging never
 * loses them. Renders nothing when everything fits on one page.
 */
export function Pager({
  path,
  params,
  page,
  total,
  pageSize = PAGE_SIZE,
  showSingle = false,
}: {
  path: string;
  params: Record<string, string | string[] | undefined>;
  page: number;
  total: number;
  pageSize?: number;
  /** Say "1-11 of 11" even when everything fits on one page (list footers). */
  showSingle?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return showSingle && total > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{total === 1 ? "1 row" : `1-${total} of ${total}`}</span> : null;
  const current = Math.min(page, pages);
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) if (one !== "") q.append(k, one);
    }
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const btn = "inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4";
  const off = "inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground opacity-40 [&_svg]:size-4";
  return (
    <nav className="flex items-center justify-end gap-2 text-xs text-muted-foreground" aria-label="Pages">
      <span className="tabular-nums">
        {from}-{to} of {total.toLocaleString("en-US")}
      </span>
      {current > 1 ? (
        <Link href={href(current - 1)} className={btn} aria-label="Previous page" scroll={false}>
          <ChevronLeft />
        </Link>
      ) : (
        <span className={off} aria-hidden>
          <ChevronLeft />
        </span>
      )}
      <span className="tabular-nums">
        Page {current} of {pages}
      </span>
      {current < pages ? (
        <Link href={href(current + 1)} className={btn} aria-label="Next page" scroll={false}>
          <ChevronRight />
        </Link>
      ) : (
        <span className={off} aria-hidden>
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}
