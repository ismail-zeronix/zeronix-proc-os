import { Badge } from "@/components/ui/badge";

/** Draft / Published / Archived, the same everywhere in the Website app. */
export function StatusBadge({ status }: { status: string }) {
  if (status === "published") return <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">Published</Badge>;
  if (status === "archived") return <Badge variant="outline">Archived</Badge>;
  if (status === "scheduled") return <Badge variant="secondary">Scheduled</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
}
