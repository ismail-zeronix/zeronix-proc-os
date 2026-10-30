import { ExternalLink, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listSegments, listSources } from "@/lib/prospecting/data";
import { ACCESS_LABELS, SourceDialog } from "../setup-ui";

export const metadata = { title: "Sources · Zeronix Prospecting" };

export default async function SourcesPage() {
  const { user } = await requireApp("prospecting");
  const admin = user.role === "admin";
  const [sources, segments] = await Promise.all([listSources(), listSegments()]);
  const segLabel = new Map(segments.map((s) => [s.key, s.label]));
  const segOptions = segments.map((s) => ({ key: s.key, label: s.label }));
  return (
    <div className="grid gap-3">
      <PageToolbar title="Sources" meta="Where prospects come from. The scraper only reads sites whose terms were checked.">
        {admin && (
          <SourceDialog
            segments={segOptions}
            trigger={
              <Button variant="outline" size="icon-sm" aria-label="Add a source" title="Add a source">
                <Plus />
              </Button>
            }
          />
        )}
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Source</TableHead>
              <TableHead>Feeds</TableHead>
              <TableHead>How we use it</TableHead>
              <TableHead>Terms checked</TableHead>
              <TableHead className="text-right">Prospects</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((s) => (
              <TableRow key={s.id} className={s.enabled ? "" : "text-muted-foreground"}>
                <TableCell className="max-w-80 py-1.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    {s.name}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" aria-label={`Open ${s.name}`} className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5">
                        <ExternalLink />
                      </a>
                    )}
                    {!s.enabled && <span className="text-xs font-normal">(not in use)</span>}
                  </div>
                  {s.notes && <div className="truncate text-xs text-muted-foreground">{s.notes}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-xs">{(s.segmentKey && segLabel.get(s.segmentKey)) || "Several"}</TableCell>
                <TableCell className="py-1.5 text-xs">{ACCESS_LABELS[s.access] ?? s.access}</TableCell>
                <TableCell className="py-1.5 text-xs">{s.termsCheckedAt ?? <span className="text-muted-foreground">Not yet</span>}</TableCell>
                <TableCell className="py-1.5 text-right text-xs tabular-nums">
                  {s.prospects ? (
                    <Link href={`/prospecting/prospects?source=${s.id}`} className="hover:underline">
                      {s.prospects}
                    </Link>
                  ) : (
                    0
                  )}
                </TableCell>
                <TableCell className="py-1.5">
                  {admin && (
                    <SourceDialog
                      segments={segOptions}
                      source={{ id: s.id, name: s.name, url: s.url, access: s.access, segmentKey: s.segmentKey ?? "", notes: s.notes, termsCheckedAt: s.termsCheckedAt ?? "", enabled: s.enabled }}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} title="Edit">
                          <Pencil />
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        LinkedIn and Google Maps are never scraped: look people up by hand and paste the link, and use the Google Places API for map data. Keep to business contact details (UAE PDPL).
      </p>
    </div>
  );
}
