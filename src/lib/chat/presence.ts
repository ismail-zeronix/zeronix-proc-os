import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAway, onlineUserIds, publish, setAway, setStatusResolver } from "./bus";
import type { ChatPrefsView, PresenceStatus } from "./types";

const DEFAULTS: ChatPrefsView = { status: "auto", dndUntil: null, sound: true, desktop: true };

type PrefsRow = typeof schema.chatPrefs.$inferSelect;

function view(row: PrefsRow | undefined): ChatPrefsView {
  if (!row) return DEFAULTS;
  // do not disturb with a time limit ends by itself
  const dndOver = row.status === "dnd" && row.dndUntil && row.dndUntil.getTime() <= Date.now();
  return { status: dndOver ? "auto" : row.status, dndUntil: dndOver ? null : (row.dndUntil?.toISOString() ?? null), sound: row.sound, desktop: row.desktop };
}

export async function prefsOf(userId: number): Promise<ChatPrefsView> {
  const [row] = await db.select().from(schema.chatPrefs).where(eq(schema.chatPrefs.userId, userId));
  return view(row);
}

function statusFrom(p: ChatPrefsView, userId: number): PresenceStatus {
  if (p.status === "dnd") return "dnd";
  if (p.status === "away" || isAway(userId)) return "away";
  return "online";
}

// the bus asks this when someone connects
setStatusResolver(async (userId) => statusFrom(await prefsOf(userId), userId));

/** Everyone connected and how they show: online, away or do not disturb. People not listed are offline. */
export async function presenceMap(): Promise<Record<number, PresenceStatus>> {
  const ids = onlineUserIds();
  if (!ids.length) return {};
  const rows = await db.select().from(schema.chatPrefs).where(inArray(schema.chatPrefs.userId, ids));
  return Object.fromEntries(ids.map((id) => [id, statusFrom(view(rows.find((r) => r.userId === id)), id)]));
}

async function announce(userId: number) {
  if (!onlineUserIds().includes(userId)) return;
  await publish("all", { t: "presence", userId, status: statusFrom(await prefsOf(userId), userId) });
}

/** Saves my chat settings (status, do not disturb until, sound, desktop alerts) and tells the others if my status changed. */
export async function savePrefs(userId: number, patch: Partial<{ status: "auto" | "away" | "dnd"; dndUntil: Date | null; sound: boolean; desktop: boolean }>): Promise<ChatPrefsView> {
  await db
    .insert(schema.chatPrefs)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: schema.chatPrefs.userId, set: patch });
  if (patch.status !== undefined || patch.dndUntil !== undefined) await announce(userId);
  return prefsOf(userId);
}

/** The browser says its tab went to the background (or came back). */
export async function reportAway(userId: number, away: boolean): Promise<void> {
  if (setAway(userId, away)) await announce(userId);
}
