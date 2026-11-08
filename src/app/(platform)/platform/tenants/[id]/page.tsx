import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPS } from "@/lib/apps";
import { requirePlatform } from "@/platform/session";
import { getTenant } from "@/platform/tenants";
import { EnterBox, InviteBox, PlanBox, StatusBox } from "./tenant-controls";

const when = (d: Date | string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }) : "-");

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const t = await getTenant(id);
  if (!t) notFound();
  const { org } = t;
  const apps = APPS.filter((a) => a.key !== "admin").map((a) => ({ key: a.key, label: a.label }));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{org.name}</h1>
        <span className="text-sm text-muted-foreground">#{org.id}</span>
        {org.status === "active" ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Paused</Badge>}
        <span className="ml-auto text-sm text-muted-foreground">Created {when(org.createdAt)}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <EnterBox orgId={org.id} active={org.status === "active"} />
        <StatusBox orgId={org.id} status={org.status} />
        <PlanBox orgId={org.id} apps={apps} enabled={org.enabledApps} userLimit={org.userLimit} />
        <InviteBox orgId={org.id} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.people.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell className="capitalize">{p.role}</TableCell>
                  <TableCell>{p.isActive ? "Active" : "Deactivated"}</TableCell>
                  <TableCell>{when(p.createdAt)}</TableCell>
                </TableRow>
              ))}
              {!t.people.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nobody has joined yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {t.invites.length > 0 && (
            <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
              {t.invites.map((i, n) => (
                <div key={n}>
                  Invitation {i.email} ({i.role}): {i.usedAt ? `used ${when(i.usedAt)}` : i.expired ? "expired" : `open until ${when(i.expiresAt)}`}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What the platform did here</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 text-sm">
          {t.visits.map((v) => (
            <div key={v.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-muted-foreground">{when(v.at)}</span>
              <span>{v.summary}</span>
              {v.reason && <span className="text-muted-foreground">Reason: {v.reason}</span>}
            </div>
          ))}
          {!t.visits.length && <p className="text-muted-foreground">Nothing yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
