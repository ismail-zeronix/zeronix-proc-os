import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Section header row: title, an optional line under it, and "view all" on the right. */
export function ShelfHeading({ title, lead, href, linkLabel }: { title: string; lead?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 sm:mb-5">
      <div className="min-w-0">
        <h2 className="text-h2 text-ink">
          {title}
        </h2>
        {lead && <p className="mt-1 hidden text-sm font-medium text-muted-ink sm:block">{lead}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-brand-800 sm:text-sm underline-offset-4 hover:text-brand-950 hover:underline">
          {linkLabel} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
