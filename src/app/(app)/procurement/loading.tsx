import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a server page fetches its data, so navigation never feels frozen. Same shape as the pages: a toolbar, then a panel. */
export default function Loading() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="ml-auto h-7 w-24" />
      </div>
      <Skeleton className="h-[calc(100svh-9rem)] w-full" />
    </div>
  );
}
