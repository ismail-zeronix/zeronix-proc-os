import { Skeleton } from "@/components/ui/skeleton";

/** White placeholder in the shape of the Gaming page (hero, ticker, builds), so a tap on "Gaming" answers at once. */
export default function Loading() {
  return (
    <div className="bg-panel">
      <div className="container-site grid gap-6 py-6 sm:py-10 lg:grid-cols-2 lg:gap-12 lg:py-14">
        <div className="grid content-center gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-11 w-60" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="aspect-[16/10] rounded-card" />
      </div>
      <Skeleton className="h-10 w-full rounded-none" />
      <div className="container-site grid grid-cols-2 gap-3 py-10 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-96 rounded-card" />
        ))}
      </div>
    </div>
  );
}
