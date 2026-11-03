import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Section header row: title (a short lime rule in front), an optional line under it, and "view all" on the right. */
export function ShelfHeading({ title, lead, href, linkLabel }: { title: string; lead?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 sm:mb-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-h2 text-ink">
          <span aria-hidden className="h-1 w-6 shrink-0 rounded-full bg-lime-400" />
          {title}
        </h2>
        {lead && <p className="mt-1 hidden text-sm text-muted-ink sm:block">{lead}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-forest-800 hover:text-forest-950 sm:text-sm">
          {linkLabel} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
