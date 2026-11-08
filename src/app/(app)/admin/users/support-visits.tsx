import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * What the platform team (Zeronix support) did in this company: every support visit, read only or with changes, and
 * why. Row-level security shows this company's rows only; nobody in the company can change or remove them.
 */
export async function SupportVisits() {
  const rows = await db.select().from(schema.platformAuditLog).orderBy(desc(schema.platformAuditLog.at)).limit(20);
  const visits = rows.filter((r) => r.action.startsWith("support.") || r.action.startsWith("tenant."));
  if (!visits.length) return null;
  return (
    <section className="grid gap-1.5 rounded-xl border bg-card p-3 text-sm">
      <h2 className="font-medium">Zeronix support in your account</h2>
      {visits.map((v) => (
        <div key={v.id} className="flex flex-wrap gap-x-2">
          <span className="tabular-nums text-muted-foreground">{v.at.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })}</span>
          <span>{v.summary}</span>
          {v.reason && <span className="text-muted-foreground">Reason: {v.reason}</span>}
        </div>
      ))}
    </section>
  );
}
