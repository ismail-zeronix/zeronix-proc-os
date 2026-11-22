import { PostsPageSkeleton } from "@/components/brand/page-skeletons";

/** Shown at once when a link to this page is tapped, until the page arrives. */
export default function Loading() {
  return <PostsPageSkeleton />;
}
