import { Plus } from "lucide-react";
import { PageToolbar } from "@/components/page-toolbar";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { isStatus } from "@/lib/prospecting/constants";
import { listProspects, listSegments, prospectingUsers } from "@/lib/prospecting/data";
import { openCampaigns } from "@/lib/prospecting/outreach";
import { ProspectDialog } from "../prospect-ui";
import { ResearchProgress } from "../research-ui";
import { ProspectTable } from "./prospect-table";

export const metadata = { title: "Prospects · Zeronix Prospecting" };

const one = (v: string | string[] | undefined) => String((Array.isArray(v) ? v[0] : v) ?? "").trim();

export default async function ProspectsPage({ searchParams }: PageProps<"/prospecting/prospects">) {
  await requireApp("prospecting");
  const sp = await searchParams;
  const status = one(sp.status);
  const owner = Number(one(sp.owner));
  const source = Number(one(sp.source));
  const page = pageParam(sp.page);
  const [{ rows, total }, segments, users, campaigns] = await Promise.all([
    listProspects({ page, pageSize: PAGE_SIZE, q: one(sp.q), status: isStatus(status) ? status : undefined, segment: one(sp.segment) || undefined, ownerId: Number.isInteger(owner) && owner > 0 ? owner : undefined, sourceId: Number.isInteger(source) && source > 0 ? source : undefined }),
    listSegments(),
    prospectingUsers(),
    openCampaigns(),
  ]);
  const segOptions = segments.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label }));
  return (
    <div className="grid gap-3">
      <PageToolbar title="Prospects" meta={`${total.toLocaleString("en-US")} ${total === 1 ? "prospect" : "prospects"} · best score first`}>
        <ProspectDialog
          segments={segOptions}
          trigger={
            <Button variant="outline" size="icon-sm" aria-label="Add a prospect" title="Add a prospect">
              <Plus />
            </Button>
          }
        />
      </PageToolbar>
      <ResearchProgress />
      <ProspectTable rows={rows} segments={segOptions} users={users} campaigns={campaigns} />
      <Pager path="/prospecting/prospects" params={sp} page={page} total={total} />
    </div>
  );
}
