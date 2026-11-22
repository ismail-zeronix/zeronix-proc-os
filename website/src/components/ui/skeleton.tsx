import { cn } from "@/lib/utils"

/** shadcn/ui Skeleton with a shimmer (a light band sweeping across, `.skeleton-shimmer` in globals.css) instead of a pulse. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
