import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Page numbers to show: first, last, and two either side of the current page, with null where pages are skipped. */
export function pageList(page: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) out.push(n);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/**
 * Numbered pages as plain links (crawlable, no JavaScript). `href(n)` builds each page's address, so filters in the
 * query string are kept; page 1 should be the address without ?page.
 */
export function Pagination({ page, pages, href, label = "Pages" }: { page: number; pages: number; href: (n: number) => string; label?: string }) {
  if (pages < 2) return null;
  const box = "grid size-10 place-items-center rounded-full border text-sm transition-colors";
  const idle = "border-line bg-white text-ink hover:border-brand-900";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" aria-label="Previous page" className={cn(box, idle)}>
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span aria-hidden className={cn(box, "border-line/60 text-ink/25")}>
          <ChevronLeft className="size-4" />
        </span>
      )}
      {pageList(page, pages).map((n, i) =>
        n === null ? (
          <span key={`gap${i}`} aria-hidden className="px-1 text-muted-ink">
            …
          </span>
        ) : (
          <Link key={n} href={href(n)} aria-current={n === page ? "page" : undefined} className={cn(box, n === page ? "border-brand-900 bg-brand-900 font-semibold text-white" : idle)}>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" aria-label="Next page" className={cn(box, idle)}>
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span aria-hidden className={cn(box, "border-line/60 text-ink/25")}>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
