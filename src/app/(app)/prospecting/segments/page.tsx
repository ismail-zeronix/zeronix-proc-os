import { Pencil } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { listSegments, prospectingOverview } from "@/lib/prospecting/data";
import { SegmentDialog } from "../setup-ui";

export const metadata = { title: "Segments · Zeronix Prospecting" };

export default async function SegmentsPage() {
  const { user } = await requireApp("prospecting");
  const [segments, o] = await Promise.all([listSegments(), prospectingOverview()]);
  const count = new Map(o.bySegment.map((s) => [s.key, s.n]));
  return (
    <div className="grid gap-3">
      <PageToolbar title="Segments" meta="Who we target, built from what we sell" />
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {segments.map((s) => (
          <section key={s.key} className={`grid content-start gap-1.5 rounded-xl border bg-card p-3 ${s.active ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</h2>
              <Link href={`/prospecting/prospects?segment=${s.key}`} className="text-xs text-muted-foreground tabular-nums hover:underline">
                {count.get(s.key) ?? 0} prospects
              </Link>
              {user.role === "admin" && (
                <SegmentDialog
                  segment={s}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.label}`} title="Edit">
                      <Pencil />
                    </Button>
                  }
                />
              )}
            </div>
            <p className="text-sm">{s.offer || <span className="text-muted-foreground">No offer written yet.</span>}</p>
            {s.keyRoles.length > 0 && <p className="text-xs text-muted-foreground">Find: {s.keyRoles.join(", ")}</p>}
            {!s.active && <p className="text-xs text-muted-foreground">Not in use</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
