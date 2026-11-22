import { Skeleton } from "@/components/ui/skeleton";
import { GridSkeleton, RailSkeleton } from "./skeleton";

/**
 * Whole-page loading screens for the loading.tsx files: shown the moment a link is tapped, in the shape of the page
 * that is coming, with the shadcn Skeleton shimmer. The header, category bar and tab bar stay as they are.
 */

/** The surface frame at the top of inner pages (PageHero): breadcrumbs, title, lead, button. */
export function PageHeroSkeleton() {
  return (
    <div aria-hidden className="frame mt-2 bg-surface">
      <div className="container-site grid gap-2.5 py-4 sm:gap-4 sm:py-8">
        <Skeleton className="h-3 w-40 rounded-full bg-white/70" />
        <Skeleton className="h-6 w-3/4 max-w-md rounded-full bg-white/70 sm:h-8" />
        <Skeleton className="h-3.5 w-11/12 max-w-xl rounded-full bg-white/70" />
        <Skeleton className="h-9 w-36 rounded-lg bg-white/70 sm:h-10" />
      </div>
    </div>
  );
}

/** A list page: header frame, a toolbar row, then product cards. */
export function CatalogPageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <PageHeroSkeleton />
      <div className="container-site grid gap-3 py-3 sm:gap-4 sm:py-6">
        <div className="flex items-center gap-2 border-b border-line/70 pb-2.5">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-3 w-28 rounded-full" />
        </div>
        <GridSkeleton count={10} />
      </div>
    </div>
  );
}

/** The product page: gallery, then name, chips, price box. */
export function ProductPageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="container-site pt-3 pb-6 sm:pt-6 sm:pb-12">
      <Skeleton className="h-3 w-56 rounded-full" />
      <div className="mt-3 grid gap-4 sm:mt-5 sm:gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <Skeleton className="aspect-[6/5] w-full rounded-frame sm:aspect-square lg:aspect-[5/4]" />
        <div className="grid content-start gap-3.5 sm:gap-5">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="h-6 w-11/12 rounded-full sm:h-8" />
          <Skeleton className="h-3 w-40 rounded-full" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-5/6 rounded-full" />
            <Skeleton className="h-3 w-4/6 rounded-full" />
          </div>
          <Skeleton className="h-36 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}

/** Articles, guides, services, industries: header frame, then picture cards. */
export function PostsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <PageHeroSkeleton />
      <div className="container-site grid gap-2 py-4 sm:grid-cols-2 sm:gap-4 sm:py-8 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} aria-hidden className="flex gap-3 rounded-card border border-line/70 bg-white p-2 sm:grid sm:gap-2.5">
            <Skeleton className="aspect-[16/9] w-[40%] shrink-0 rounded-inner sm:w-full" />
            <div className="grid flex-1 content-start gap-2 py-1 sm:px-1 sm:pb-2">
              <Skeleton className="h-2.5 w-24 rounded-full" />
              <Skeleton className="h-4 w-11/12 rounded-full" />
              <Skeleton className="h-3 w-4/5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The grey home page: banner row, category circles, product shelves. */
export function HomeSkeleton() {
  const panel = "-mx-3 bg-white px-3 py-3 sm:mx-0 sm:rounded-xl sm:px-5 sm:py-5";
  return (
    <div role="status" aria-label="Loading" className="page-grey bg-page pb-4">
      <div className="container-site pt-2 sm:pt-3 lg:pt-4">
        <div className="-mx-3 flex gap-2 overflow-hidden px-3 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
          <Skeleton className="aspect-[16/9] w-[90%] shrink-0 rounded-xl bg-ink/10 sm:aspect-auto sm:h-64 sm:w-[64%] lg:h-[28rem] lg:w-full" />
          <Skeleton className="aspect-[16/9] w-[90%] shrink-0 rounded-xl bg-ink/10 sm:aspect-auto sm:h-64 sm:w-[64%] lg:hidden" />
        </div>
      </div>
      <div className="container-site mt-1.5 sm:mt-3">
        <div className={panel}>
          <Skeleton className="mb-3 h-4 w-36 rounded-full" />
          <div className="grid grid-cols-5 gap-x-1 gap-y-2.5 lg:grid-cols-10">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="grid justify-items-center gap-1.5">
                <Skeleton className="size-12 rounded-full sm:size-16" />
                <Skeleton className="h-2 w-10 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {[0, 1].map((k) => (
        <div key={k} className="container-site mt-1.5 sm:mt-3">
          <div className={panel}>
            <Skeleton className="mb-3 h-4 w-40 rounded-full" />
            <RailSkeleton />
          </div>
        </div>
      ))}
    </div>
  );
}
