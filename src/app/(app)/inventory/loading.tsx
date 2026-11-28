import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the moment a sidebar item is clicked, while the server reads the page's data, so nothing looks frozen. The
 * same frame as the lists (toolbar, then the table and its bottom bar), so the page lands where the outline was.
 */
export default function Loading() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      <div className="flex h-8 flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-5 w-48 max-sm:hidden" />
        <Skeleton className="ml-auto h-8 w-28" />
      </div>
      <Skeleton className="h-[calc(100svh-var(--mobile-nav-h)-10rem)] w-full rounded-lg" />
    </div>
  );
}
