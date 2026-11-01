import { pageReport } from "@/lib/website/analytics";
import { getGsc, queriesForPage } from "@/lib/website/gsc";

const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`);

/** How a published post is doing: our tracker's numbers for 90 days, and its Google searches once Search Console is on. */
export async function PostStats({ path }: { path: string }) {
  const [r, gsc] = await Promise.all([pageReport(path), getGsc()]);
  const queries = gsc?.credentials ? await queriesForPage(path) : null;
  const facts: [string, string][] = [
    ["Views", String(r.views)],
    ["Visitors", String(r.visitors)],
    ["Time on page", duration(r.engagedAvg)],
    ["CTA clicks", String(r.cta)],
    ["Entrances", String(r.entrances)],
    ["Leads started here", String(r.leads)],
  ];
  return (
    <section className="grid gap-2 rounded-lg border bg-card p-3">
      <h2 className="text-sm font-semibold">
        Last {r.days} days <span className="font-normal text-muted-foreground">· {path}</span>
      </h2>
      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {queries === null ? (
        <p className="text-xs text-muted-foreground">Google searches for this page appear once Search Console is connected (Website › Settings).</p>
      ) : queries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Google searches for this page yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Google search</th>
              <th className="py-1 text-right font-medium">Clicks</th>
              <th className="py-1 text-right font-medium">Impressions</th>
              <th className="py-1 text-right font-medium">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {queries.map((q) => (
              <tr key={q.query}>
                <td className="py-1">{q.query}</td>
                <td className="py-1 text-right">{q.clicks}</td>
                <td className="py-1 text-right">{q.impressions}</td>
                <td className="py-1 text-right">{q.position ? q.position.toFixed(1) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
