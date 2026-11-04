import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { publish } from "@/lib/chat/bus";
import type { BellData, NotificationKind, NotificationView, Priority } from "./types";

const n = schema.notifications;
const actor = alias(schema.users, "actor");

export interface NotifyInput {
  userIds: number[];
  kind: NotificationKind;
  /** The rule or event key, e.g. deal_assigned, task_overdue. */
  rule: string;
  priority: Priority;
  title: string;
  body?: string;
  link: string;
  record?: { type: string; id: number };
  /** Who did it; they are never told about their own action. */
  actorId?: number | null;
  /** The same key for the same person is the same line: it is reopened instead of added twice. */
  key: string;
  dueAt?: Date | null;
}

const rank = sql<number>`case ${n.priority} when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;
/** Not snoozed (or the snooze is over). */
const awake = () => or(isNull(n.snoozedUntil), lte(n.snoozedUntil, new Date()));

const viewColumns = {
  id: n.id,
  kind: n.kind,
  rule: n.rule,
  priority: n.priority,
  title: n.title,
  body: n.body,
  link: n.link,
  dueAt: n.dueAt,
  createdAt: n.createdAt,
  readAt: n.readAt,
  resolvedAt: n.resolvedAt,
  actorName: actor.name,
};

interface ViewRow {
  id: number;
  kind: NotificationKind;
  rule: string;
  priority: Priority;
  title: string;
  body: string;
  link: string;
  dueAt: Date | null;
  createdAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
  actorName: string | null;
}

const toView = (r: ViewRow): NotificationView => ({
  id: r.id,
  kind: r.kind,
  rule: r.rule,
  priority: r.priority,
  title: r.title,
  body: r.body,
  link: r.link,
  dueAt: r.dueAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  readAt: r.readAt?.toISOString() ?? null,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  actorName: r.actorName,
});

async function views(where: SQL | undefined, limit: number): Promise<NotificationView[]> {
  const rows = await db
    .select(viewColumns)
    .from(n)
    .leftJoin(actor, eq(actor.id, n.actorId))
    .where(where)
    .orderBy(rank, desc(n.createdAt))
    .limit(limit);
  return rows.map(toView);
}

/**
 * Puts a line in these people's bells (active users only, never the actor) and pushes it to their open portal tabs.
 * An assignment with a key already used is brought back to the top as unread. A system alert with a used key comes
 * back only if it had been resolved, so a rule that keeps matching never repeats itself. Returns who was told.
 */
export async function notify(input: NotifyInput): Promise<number[]> {
  let ids = [...new Set(input.userIds)].filter((id) => id !== input.actorId);
  if (!ids.length) return [];
  const active = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.id, ids), eq(schema.users.isActive, true)));
  ids = ids.filter((id) => active.some((a) => a.id === id));
  if (!ids.length) return [];

  const now = new Date();
  const fields = {
    kind: input.kind,
    rule: input.rule,
    priority: input.priority,
    title: input.title.slice(0, 200),
    body: (input.body ?? "").slice(0, 500),
    link: input.link,
    recordType: input.record?.type ?? null,
    recordId: input.record?.id ?? null,
    actorId: input.actorId ?? null,
    dueAt: input.dueAt ?? null,
  };
  const saved = await db
    .insert(n)
    .values(ids.map((userId) => ({ ...fields, userId, dedupeKey: input.key, createdAt: now })))
    .onConflictDoUpdate({
      target: [n.userId, n.dedupeKey],
      set: { ...fields, createdAt: now, readAt: null, resolvedAt: null, snoozedUntil: null },
      setWhere: input.kind === "system" ? isNotNull(n.resolvedAt) : undefined,
    })
    .returning({ id: n.id, userId: n.userId });
  if (!saved.length) return [];

  const [who] = input.actorId ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, input.actorId)) : [];
  for (const s of saved) {
    const view: NotificationView = {
      id: s.id,
      kind: fields.kind,
      rule: fields.rule,
      priority: fields.priority,
      title: fields.title,
      body: fields.body,
      link: fields.link,
      dueAt: fields.dueAt?.toISOString() ?? null,
      createdAt: now.toISOString(),
      readAt: null,
      resolvedAt: null,
      actorName: who?.name ?? null,
    };
    await publish([s.userId], { t: "notification", n: view });
  }
  return saved.map((s) => s.userId);
}

/**
 * The scan of one rule found these lines still true (`userId|key`). Every other open line of that rule is resolved:
 * its condition no longer holds (quote sent, task done...) or a later step replaced it. Returns how many were closed.
 */
export async function resolveExcept(rule: string, keep: Set<string>): Promise<number> {
  const open = await db.select({ id: n.id, userId: n.userId, key: n.dedupeKey }).from(n).where(and(eq(n.rule, rule), isNull(n.resolvedAt)));
  const gone = open.filter((o) => !keep.has(`${o.userId}|${o.key}`));
  if (!gone.length) return 0;
  await db.update(n).set({ resolvedAt: new Date() }).where(inArray(n.id, gone.map((g) => g.id)));
  await publish([...new Set(gone.map((g) => g.userId))], { t: "notification.sync" });
  return gone.length;
}

/** Closes the open lines about one record (e.g. an assignment line once the person is taken off the deal). */
export async function resolveFor(userIds: number[], rule: string, record: { type: string; id: number }): Promise<void> {
  if (!userIds.length) return;
  const done = await db
    .update(n)
    .set({ resolvedAt: new Date() })
    .where(and(inArray(n.userId, userIds), eq(n.rule, rule), eq(n.recordType, record.type), eq(n.recordId, record.id), isNull(n.resolvedAt)))
    .returning({ userId: n.userId });
  if (done.length) await publish([...new Set(done.map((d) => d.userId))], { t: "notification.sync" });
}

/** The bell: open lines (not resolved, not snoozed), most urgent first, and the unread count. */
export async function bellFor(userId: number): Promise<BellData> {
  const open = and(eq(n.userId, userId), isNull(n.resolvedAt), awake());
  const [items, [counts]] = await Promise.all([
    views(open, 60),
    db
      .select({
        unread: sql<number>`count(*)::int`,
        critical: sql<boolean>`coalesce(bool_or(${n.priority} = 'critical'), false)`,
      })
      .from(n)
      .where(and(open, isNull(n.readAt))),
  ]);
  return { items, unread: counts?.unread ?? 0, critical: counts?.critical ?? false };
}

export type ListFilter = { state?: "open" | "resolved" | "all"; priority?: Priority; kind?: NotificationKind };

/** The full list on the Notifications page. */
export async function listFor(userId: number, f: ListFilter = {}): Promise<NotificationView[]> {
  const state = f.state ?? "open";
  return views(
    and(
      eq(n.userId, userId),
      state === "open" ? isNull(n.resolvedAt) : state === "resolved" ? isNotNull(n.resolvedAt) : undefined,
      f.priority ? eq(n.priority, f.priority) : undefined,
      f.kind ? eq(n.kind, f.kind) : undefined,
    ),
    300,
  );
}

/** Marks lines read (all open ones when `ids` is left out). Only the person's own lines are touched. */
export async function markRead(userId: number, ids?: number[]): Promise<void> {
  if (ids && !ids.length) return;
  await db
    .update(n)
    .set({ readAt: new Date() })
    .where(and(eq(n.userId, userId), isNull(n.readAt), ids ? inArray(n.id, ids) : isNull(n.resolvedAt)));
  await publish([userId], { t: "notification.sync" });
}

/** Hides a line until `until`; it comes back unread. */
export async function snooze(userId: number, id: number, until: Date): Promise<void> {
  await db.update(n).set({ snoozedUntil: until, readAt: null }).where(and(eq(n.userId, userId), eq(n.id, id)));
  await publish([userId], { t: "notification.sync" });
}
