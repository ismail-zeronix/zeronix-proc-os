import { desc, eq, like } from "drizzle-orm";
import { CopyButton } from "@/components/copy-button";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { listConnections, mcpUrl, portalBase } from "@/lib/mcp/oauth";
import { RevokeButton } from "./revoke-button";

export const metadata = { title: "Claude · Admin · Zeronix" };

/**
 * The Claude connector: the address to add in Claude, who is connected (read or read + write) with a Disconnect button,
 * and every change Claude made (audit_log rows "claude.*").
 */
export default async function AdminClaudePage() {
  await requireApp("admin");
  const url = mcpUrl(portalBase());
  const [connections, log] = await Promise.all([
    listConnections(),
    db
      .select({ id: schema.auditLog.id, at: schema.auditLog.at, action: schema.auditLog.action, summary: schema.auditLog.summary, userName: schema.users.name })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
      .where(like(schema.auditLog.action, "claude.%"))
      .orderBy(desc(schema.auditLog.at))
      .limit(100),
  ]);

  return (
    <div className="grid gap-3">
      <PageToolbar title="Claude" meta="Let Claude read the business data, suggest what to do, and make small changes as you" />

      <section className="grid gap-2 rounded-lg border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Connector address</span>
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{url}</code>
          <CopyButton text={url} />
        </div>
        <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>In Claude (claude.ai, desktop or phone app): Settings › Connectors › Add custom connector, and paste the address.</li>
          <li>Claude opens Zeronix OS: sign in, tick Write if Claude may make changes, and press Allow.</li>
          <li>Ask, for example: &ldquo;What needs my attention today?&rdquo; or &ldquo;Who owes us money over 60 days?&rdquo;</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Admins and sales staff can connect. Claude sees what that person sees in the portal (their apps, Own deals or All data); sales staff must be punched in for
          Claude to make changes. Changes are limited to tasks, notes, deal updates, new leads and customers, and draft quotes; Claude never deletes,
          posts money or emails customers, and asks in the chat before each change.
        </p>
      </section>

      <section className="grid gap-1">
        <h2 className="text-sm font-medium">Connected</h2>
        <ul className="divide-y rounded-lg border bg-card">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-32 font-medium">{c.userName}</span>
              <span className="text-muted-foreground">{c.app || "Claude"}</span>
              <span className="rounded-sm border px-1 text-[10px] font-medium text-muted-foreground">{c.scope.includes("write") ? "Read + write" : "Read only"}</span>
              <span className="text-xs text-muted-foreground">connected {ago(c.createdAt)}</span>
              <span className="flex-1 text-xs text-muted-foreground">{c.lastUsedAt ? `last used ${ago(c.lastUsedAt)}` : "not used yet"}</span>
              <RevokeButton id={c.id} who={c.userName} />
            </li>
          ))}
          {!connections.length && (
            <li>
              <Empty>Nobody has connected Claude yet.</Empty>
            </li>
          )}
        </ul>
      </section>

      <section className="grid gap-1">
        <h2 className="text-sm font-medium">What Claude did</h2>
        <ul className="divide-y rounded-lg border bg-card">
          {log.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted-foreground" title={r.at.toISOString()}>
                {ago(r.at)}
              </span>
              <span className="rounded-sm border px-1 font-mono text-[10px] text-muted-foreground">{r.action.replace(/^claude\./, "")}</span>
              <span className="min-w-0 flex-1 truncate">{r.summary}</span>
              <span className="text-xs text-muted-foreground">{r.userName ?? "-"}</span>
            </li>
          ))}
          {!log.length && (
            <li>
              <Empty>No changes yet.</Empty>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
