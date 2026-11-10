import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders in the exact shape of ProductCard (cards.tsx), built from shadcn/ui Skeleton (components/ui), so
 * nothing jumps when the real cards arrive.
 */

/** Rail columns, shared by ProductRail and its placeholder so both line up card for card. */
export const RAIL_ROW =
  "-mx-3 grid auto-cols-[46%] grid-flow-col gap-2.5 overflow-x-auto overscroll-x-contain scroll-px-3 px-3 pb-1 [scrollbar-width:none] sm:-mx-5 sm:auto-cols-[31%] sm:scroll-px-5 sm:gap-3 sm:px-5 lg:mx-0 lg:auto-cols-[calc((100%-3rem)/5)] lg:scroll-px-0 lg:px-0 xl:auto-cols-[calc((100%-3.75rem)/6)] [&::-webkit-scrollbar]:hidden";

/** Grid columns of ProductGrid (page-parts.tsx). */
export const GRID_COLS = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5";
/** The same grid next to a filter column (category pages on desktop): one column fewer. */
export const GRID_COLS_FILTERED = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4";

export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex h-full flex-col rounded-card border border-line/70 bg-white p-2", className)}>
      <Skeleton className="aspect-square w-full rounded-inner" />
      <div className="flex flex-1 flex-col gap-2 px-1 pt-3">
        <Skeleton className="h-2.5 w-1/3 rounded-full" />
        <Skeleton className="h-3 w-11/12 rounded-full" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
        <Skeleton className="h-2.5 w-4/5 rounded-full" />
        <div className="mt-auto flex items-end justify-between pt-3">
          <div className="grid gap-1.5">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-2 w-10 rounded-full" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** A rail of placeholder cards (home shelves). */
export function RailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading products" className={cn(RAIL_ROW, "overflow-hidden")}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A grid of placeholder cards (category pages). */
export function GridSkeleton({ count = 10, cols = GRID_COLS }: { count?: number; cols?: string }) {
  return (
    <div role="status" aria-label="Loading more products" className={cols}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} className={cn(i >= 4 && "hidden sm:flex", i >= 6 && "sm:hidden lg:flex")} />
      ))}
    </div>
  );
}
