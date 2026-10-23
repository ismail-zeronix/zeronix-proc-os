import "server-only";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Access } from "@/lib/auth/session";
import { canSeeDeal, viewerOf } from "@/lib/auth/visibility";
import { publish } from "./bus";
import { dmKey, previewOf } from "./text";
import type { ChannelKind, ChannelSummary, ChatUser, OpenGroup } from "./types";

const GONE = "That conversation does not exist or you are not in it.";

/** The one DM between two people, created the first time either of them opens it. */
export async function getOrCreateDm(me: number, peer: number): Promise<number> {
  const key = dmKey(me, peer);
  return db.transaction(async (tx) => {
    const [made] = await tx
      .insert(schema.chatChannels)
      .values({ kind: "dm", dmKey: key, createdBy: me })
      .onConflictDoNothing({ target: schema.chatChannels.dmKey })
      .returning({ id: schema.chatChannels.id });
    const id = made?.id ?? (await tx.select({ id: schema.chatChannels.id }).from(schema.chatChannels).where(eq(schema.chatChannels.dmKey, key)))[0].id;
    await tx
      .insert(schema.chatMembers)
      .values([me, peer].filter((u, i, all) => all.indexOf(u) === i).map((userId) => ({ channelId: id, userId })))
      .onConflictDoNothing();
    return id;
  });
}

export interface ChannelAccess {
  id: number;
  kind: ChannelKind;
  role: "owner" | "member";
  isPrivate: boolean;
  archived: boolean;
  recordType: string | null;
  recordId: number | null;
  /** The group owner or an admin: may rename it, change who is in it and archive it. */
  canManage: boolean;
}

/**
 * Lets the user into a conversation, or throws. Members are in. A deal's thread is also open to anyone who may see the
 * deal (admins, "All data" users): they join it the first time they open it.
 */
export async function openChannel(channelId: number, access: Access): Promise<ChannelAccess> {
  const userId = access.user.id;
  const [row] = await db
    .select({
      id: schema.chatChannels.id,
      kind: schema.chatChannels.kind,
      isPrivate: schema.chatChannels.isPrivate,
      archivedAt: schema.chatChannels.archivedAt,
      recordType: schema.chatChannels.recordType,
      recordId: schema.chatChannels.recordId,
      role: schema.chatMembers.role,
    })
    .from(schema.chatChannels)
    .leftJoin(schema.chatMembers, and(eq(schema.chatMembers.channelId, schema.chatChannels.id), eq(schema.chatMembers.userId, userId)))
    .where(eq(schema.chatChannels.id, channelId));
  if (!row) throw new Error(GONE);
  let role = row.role;
  if (!role) {
    const dealThread = row.kind === "record" && row.recordType === "deal" && row.recordId != null;
    if (!dealThread || !(await canSeeDeal(viewerOf(access), row.recordId!))) throw new Error(GONE);
    await db.insert(schema.chatMembers).values({ channelId, userId }).onConflictDoNothing();
    role = "member";
  }
  return {
    id: row.id,
    kind: row.kind,
    role,
    isPrivate: row.isPrivate,
    archived: !!row.archivedAt,
    recordType: row.recordType,
    recordId: row.recordId,
    canManage: row.kind === "group" && (role === "owner" || access.user.role === "admin"),
  };
}

export async function memberIds(channelId: number): Promise<number[]> {
  const rows = await db.select({ userId: schema.chatMembers.userId }).from(schema.chatMembers).where(eq(schema.chatMembers.channelId, channelId));
  return rows.map((r) => r.userId);
}

/** Everyone in a conversation with how far they have read (for "Seen"). */
export async function membersOf(channelId: number): Promise<(ChatUser & { lastReadId: number; role: "owner" | "member" })[]> {
  return db
    .select({ id: schema.users.id, name: schema.users.name, lastReadId: schema.chatMembers.lastReadId, role: schema.chatMembers.role })
    .from(schema.chatMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId))
    .where(eq(schema.chatMembers.channelId, channelId))
    .orderBy(schema.users.name);
}

/** Only active portal users can be put in a conversation. */
async function activeIds(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.id, ids), eq(schema.users.isActive, true)));
  return rows.map((r) => r.id);
}

// ---------- groups ----------

export async function createGroup(by: number, input: { name: string; topic: string; isPrivate: boolean; memberIds: number[] }): Promise<number> {
  const others = (await activeIds(input.memberIds)).filter((id) => id !== by);
  const id = await db.transaction(async (tx) => {
    const [ch] = await tx
      .insert(schema.chatChannels)
      .values({ kind: "group", name: input.name, topic: input.topic, isPrivate: input.isPrivate, createdBy: by })
      .returning({ id: schema.chatChannels.id });
    await tx.insert(schema.chatMembers).values([{ channelId: ch.id, userId: by, role: "owner" as const }, ...others.map((userId) => ({ channelId: ch.id, userId }))]);
    return ch.id;
  });
  await publish([by, ...others], { t: "channel.update", channelId: id });
  return id;
}

/** Public groups the user is not in yet. */
export async function listOpenGroups(userId: number): Promise<OpenGroup[]> {
  const res = await db.execute<{ id: number; name: string; topic: string; members: number }>(sql`
    SELECT c.id, c.name, c.topic, (SELECT count(*)::int FROM chat_members m WHERE m.channel_id = c.id) AS members
    FROM chat_channels c
    WHERE c.kind = 'group' AND NOT c.is_private AND c.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = c.id AND m.user_id = ${userId})
    ORDER BY c.name
  `);
  return res.rows;
}

export async function joinGroup(channelId: number, userId: number): Promise<void> {
  const [ch] = await db
    .select({ id: schema.chatChannels.id })
    .from(schema.chatChannels)
    .where(and(eq(schema.chatChannels.id, channelId), eq(schema.chatChannels.kind, "group"), eq(schema.chatChannels.isPrivate, false), isNull(schema.chatChannels.archivedAt)));
  if (!ch) throw new Error("That channel is private or no longer exists.");
  await db.insert(schema.chatMembers).values({ channelId, userId }).onConflictDoNothing();
  await publish(await memberIds(channelId), { t: "channel.update", channelId });
}

export async function updateGroup(channelId: number, patch: { name?: string; topic?: string; isPrivate?: boolean; archived?: boolean }): Promise<void> {
  const { archived, ...rest } = patch;
  await db
    .update(schema.chatChannels)
    .set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
    .where(eq(schema.chatChannels.id, channelId));
  await publish(await memberIds(channelId), { t: "channel.update", channelId });
}

export async function addMembers(channelId: number, ids: number[]): Promise<void> {
  const ok = await activeIds(ids);
  if (!ok.length) return;
  await db
    .insert(schema.chatMembers)
    .values(ok.map((userId) => ({ channelId, userId })))
    .onConflictDoNothing();
  await publish(await memberIds(channelId), { t: "channel.update", channelId });
}

/** Takes someone out of a group (or they leave). If the owner leaves, the longest-standing member becomes the owner. */
export async function removeMember(channelId: number, userId: number): Promise<void> {
  const before = await memberIds(channelId);
  const [gone] = await db
    .delete(schema.chatMembers)
    .where(and(eq(schema.chatMembers.channelId, channelId), eq(schema.chatMembers.userId, userId)))
    .returning({ role: schema.chatMembers.role });
  if (gone?.role === "owner") {
    const [next] = await db
      .select({ userId: schema.chatMembers.userId })
      .from(schema.chatMembers)
      .where(eq(schema.chatMembers.channelId, channelId))
      .orderBy(schema.chatMembers.joinedAt)
      .limit(1);
    if (next)
      await db
        .update(schema.chatMembers)
        .set({ role: "owner" })
        .where(and(eq(schema.chatMembers.channelId, channelId), eq(schema.chatMembers.userId, next.userId)));
  }
  await publish(before, { t: "channel.update", channelId });
}

// ---------- deal threads ----------

/** The chat thread of a deal (a project uses its deal's thread). Created the first time someone opens it; the deal's team is in it. */
export async function getOrCreateDealThread(dealId: number): Promise<number> {
  const id = await db.transaction(async (tx) => {
    const [made] = await tx
      .insert(schema.chatChannels)
      .values({ kind: "record", recordType: "deal", recordId: dealId })
      .onConflictDoNothing({ target: [schema.chatChannels.recordType, schema.chatChannels.recordId] })
      .returning({ id: schema.chatChannels.id });
    if (made) {
      const team = await tx.select({ userId: schema.dealAssignees.userId }).from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, dealId));
      if (team.length) await tx.insert(schema.chatMembers).values(team.map((t) => ({ channelId: made.id, userId: t.userId }))).onConflictDoNothing();
      return made.id;
    }
    const [row] = await tx
      .select({ id: schema.chatChannels.id })
      .from(schema.chatChannels)
      .where(and(eq(schema.chatChannels.recordType, "deal"), eq(schema.chatChannels.recordId, dealId)));
    return row.id;
  });
  return id;
}

/**
 * After the deal's team changed: new people join its thread, and people taken off the deal leave it (unless they see
 * every deal anyway). Does nothing if the deal has no thread yet.
 */
export async function syncDealThread(dealId: number): Promise<void> {
  const [ch] = await db
    .select({ id: schema.chatChannels.id })
    .from(schema.chatChannels)
    .where(and(eq(schema.chatChannels.recordType, "deal"), eq(schema.chatChannels.recordId, dealId)));
  if (!ch) return;
  const before = await memberIds(ch.id);
  const team = (await db.select({ userId: schema.dealAssignees.userId }).from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, dealId))).map((t) => t.userId);
  if (team.length) await db.insert(schema.chatMembers).values(team.map((userId) => ({ channelId: ch.id, userId }))).onConflictDoNothing();
  // people who still see every deal (admins, "All data") may stay
  const seeAll = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(or(eq(schema.users.role, "admin"), eq(schema.users.dataScope, "all")));
  await db
    .delete(schema.chatMembers)
    .where(
      and(
        eq(schema.chatMembers.channelId, ch.id),
        team.length ? notInArray(schema.chatMembers.userId, team) : undefined,
        notInArray(schema.chatMembers.userId, seeAll),
      ),
    );
  await publish([...new Set([...before, ...team])], { t: "channel.update", channelId: ch.id });
}

/** A deal was deleted: its thread goes with it. */
export async function deleteDealThread(dealId: number): Promise<void> {
  await db.delete(schema.chatChannels).where(and(eq(schema.chatChannels.recordType, "deal"), eq(schema.chatChannels.recordId, dealId)));
}

// ---------- the list ----------

/** The user's conversations, most recent first, with unread counts and the last message. Deal threads show once someone has written in them. */
export async function listChannelsFor(userId: number): Promise<ChannelSummary[]> {
  const res = await db.execute<{
    id: number;
    kind: ChannelKind;
    name: string;
    topic: string;
    is_private: boolean;
    role: "owner" | "member";
    record_type: string | null;
    record_id: number | null;
    deal_title: string | null;
    company_name: string | null;
    project_id: number | null;
    last_message_at: Date | null;
    muted_until: Date | null;
    unread: number;
    last_body: string | null;
    last_kind: string | null;
    last_from: string | null;
    last_from_id: number | null;
  }>(sql`
    SELECT c.id, c.kind, c.name, c.topic, c.is_private, m.role, c.record_type, c.record_id, c.last_message_at, m.muted_until,
      d.title AS deal_title, co.name AS company_name, p.id AS project_id,
      (SELECT count(*)::int FROM chat_messages x
        WHERE x.channel_id = c.id AND x.id > m.last_read_id AND x.thread_id IS NULL AND x.deleted_at IS NULL
          AND (x.user_id IS NULL OR x.user_id <> ${userId})) AS unread,
      lm.body AS last_body, lm.kind AS last_kind, lu.name AS last_from, lm.user_id AS last_from_id
    FROM chat_members m
    JOIN chat_channels c ON c.id = m.channel_id
    LEFT JOIN deals d ON c.record_type = 'deal' AND d.id = c.record_id
    LEFT JOIN companies co ON co.id = d.company_id
    LEFT JOIN projects p ON p.deal_id = d.id
    LEFT JOIN LATERAL (
      SELECT body, kind, user_id FROM chat_messages
      WHERE channel_id = c.id AND thread_id IS NULL AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    ) lm ON TRUE
    LEFT JOIN users lu ON lu.id = lm.user_id
    WHERE m.user_id = ${userId} AND c.archived_at IS NULL
      AND (c.kind <> 'record' OR (d.id IS NOT NULL AND c.last_message_at IS NOT NULL))
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
  `);
  const ids = res.rows.map((r) => r.id);
  const members = ids.length
    ? await db
        .select({ channelId: schema.chatMembers.channelId, id: schema.users.id, name: schema.users.name, role: schema.chatMembers.role })
        .from(schema.chatMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId))
        .where(inArray(schema.chatMembers.channelId, ids))
        .orderBy(schema.users.name)
    : [];
  const byChannel = new Map<number, ChannelSummary["members"]>();
  for (const m of members) {
    const list = byChannel.get(m.channelId) ?? [];
    list.push({ id: m.id, name: m.name, role: m.role });
    byChannel.set(m.channelId, list);
  }
  const now = Date.now();
  return res.rows.map((r) => {
    const all = byChannel.get(r.id) ?? [];
    const peer = r.kind === "dm" ? (all.find((u) => u.id !== userId) ?? all[0] ?? null) : null;
    const record =
      r.kind === "record" && r.record_id != null
        ? {
            type: r.record_type ?? "deal",
            id: r.record_id,
            href: r.project_id ? `/projects/list/${r.project_id}?tab=chat` : `/sales/deals/${r.record_id}?tab=chat`,
            subtitle: r.company_name ?? "",
          }
        : null;
    return {
      id: r.id,
      kind: r.kind,
      name: r.kind === "dm" ? (peer?.name ?? "Direct message") : r.kind === "record" ? (r.deal_title ?? "Deal") : r.name,
      topic: r.topic,
      isPrivate: r.is_private,
      role: r.role,
      peer,
      members: all,
      record,
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
      lastPreview: r.last_body != null ? previewOf(r.last_kind ?? "text", r.last_body) : "",
      lastFrom: r.last_from,
      lastFromId: r.last_from_id,
      unread: r.unread,
      muted: !!r.muted_until && new Date(r.muted_until).getTime() > now,
    };
  });
}

/** One conversation as the list shows it, also for a deal thread nobody has written in yet (the deal page's Chat tab). */
export async function channelSummary(channelId: number, userId: number): Promise<ChannelSummary | null> {
  const all = await listChannelsFor(userId);
  const hit = all.find((c) => c.id === channelId);
  if (hit) return hit;
  // an empty deal thread is left out of the list; build it here
  const [row] = await db
    .select({
      id: schema.chatChannels.id,
      recordId: schema.chatChannels.recordId,
      title: schema.deals.title,
      company: schema.companies.name,
      projectId: schema.projects.id,
      role: schema.chatMembers.role,
    })
    .from(schema.chatChannels)
    .innerJoin(schema.chatMembers, and(eq(schema.chatMembers.channelId, schema.chatChannels.id), eq(schema.chatMembers.userId, userId)))
    .innerJoin(schema.deals, eq(schema.deals.id, schema.chatChannels.recordId))
    .leftJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .leftJoin(schema.projects, eq(schema.projects.dealId, schema.deals.id))
    .where(and(eq(schema.chatChannels.id, channelId), eq(schema.chatChannels.kind, "record")));
  if (!row) return null;
  const members = await membersOf(channelId);
  return {
    id: row.id,
    kind: "record",
    name: row.title,
    topic: "",
    isPrivate: true,
    role: row.role,
    peer: null,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    record: {
      type: "deal",
      id: row.recordId!,
      href: row.projectId ? `/projects/list/${row.projectId}?tab=chat` : `/sales/deals/${row.recordId}?tab=chat`,
      subtitle: row.company ?? "",
    },
    lastMessageAt: null,
    lastPreview: "",
    lastFrom: null,
    lastFromId: null,
    unread: 0,
    muted: false,
  };
}
