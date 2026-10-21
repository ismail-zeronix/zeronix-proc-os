import Link from "next/link";

export interface SegmentItem {
  href: string;
  /** Visible text; leave out for an icon-only button (then `title` is its name). */
  label?: string;
  icon?: React.ReactNode;
  title: string;
  active: boolean;
}

/** A small pill-shaped switch made of links, e.g. List | Board or Mine | All. State lives in the URL, so it works without JavaScript. */
export function Segmented({ items, className = "" }: { items: SegmentItem[]; className?: string }) {
  return (
    <div className={`inline-flex max-w-full shrink-0 overflow-x-auto rounded-lg border bg-muted/50 p-0.5 ${className}`} role="group">
      {items.map((i) => (
        <Link
          key={i.title}
          href={i.href}
          title={i.title}
          aria-label={i.title}
          aria-current={i.active ? "true" : undefined}
          className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors [&_svg]:size-4 ${
            i.active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {i.icon}
          {i.label}
        </Link>
      ))}
    </div>
  );
}
