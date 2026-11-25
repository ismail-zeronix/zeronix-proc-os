import { PageToolbar } from "@/components/page-toolbar";
import { listSegments, listSources } from "@/lib/prospecting/data";
import { ImportFlow } from "./import-ui";
import { requireOutreachFull } from "@/lib/prospecting/access";

export const metadata = { title: "Import · Zeronix Outreach" };

export default async function ImportPage() {
  await requireOutreachFull();
  const [segments, sources] = await Promise.all([listSegments(), listSources()]);
  return (
    <div className="grid gap-3">
      <PageToolbar title="Import a list" meta="CSV or Excel · check the columns, then add" />
      <ImportFlow
        segments={segments.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label }))}
        sources={sources.filter((s) => s.enabled && s.key !== "manual").map((s) => ({ key: s.key, name: s.name }))}
      />
    </div>
  );
}
