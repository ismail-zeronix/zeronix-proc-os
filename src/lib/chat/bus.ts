import "server-only";
import { Client } from "pg";
import { pool } from "@/db";
import type { VisitorEvent } from "@/lib/webchat/types";
import type { ChatEvent, PresenceStatus } from "./types";

/**
 * The live part of the chat. Anything that changes a conversation calls `publish`, which goes through Postgres
 * NOTIFY so every portal process (the web server, and the standalone worker if it runs) hears it. Each process
 * keeps one LISTEN connection (outside the pool) and hands events to the browsers it has open streams for.
 *
 * Events are addressed to user ids. A message that is too big for a NOTIFY payload (8 KB) is sent as its id and
 * read back from the database on arrival. Website visitors (lib/webchat) are addressed by their chat id instead.
 */

const CHANNEL = "chat";
/** Leave room under Postgres' 8000-byte NOTIFY limit. */
const MAX_PAYLOAD = 7500;

/** On the wire: who it is for (`"all"` = everybody connected) and either the event or a message id to load. */
interface Envelope {
  to: number[] | "all";
  evt?: ChatEvent;
  messageId?: number;
  /** For a website visitor's widget: their chat id and the event. */
  visitor?: number;
  vevt?: VisitorEvent;
}

type Listener = (evt: ChatEvent | { t: "resync" }) => void;
type VisitorListener = (evt: VisitorEvent) => void;

interface Bus {
  listeners: Map<number, Set<Listener>>;
  /** Website chat id → the visitor's open widget streams. */
  visitors: Map<number, Set<VisitorListener>>;
  /** People whose portal tab has been in the background for a while. */
  away: Set<number>;
  client: Client | null;
  connecting: Promise<void> | null;
}

// one per process, also across dev hot reloads
const g = globalThis as unknown as { chatBus?: Bus };
const bus: Bus = (g.chatBus ??= { listeners: new Map(), visitors: new Map(), away: new Set(), client: null, connecting: null });
bus.away ??= new Set(); // a bus made before these fields existed (dev hot reload)
bus.visitors ??= new Map();

/** Someone's status as others should see it while connected (set by presence.ts: do not disturb, away, online). */
let statusOf: (userId: number) => Promise<PresenceStatus> = async () => "online";
export function setStatusResolver(fn: (userId: number) => Promise<PresenceStatus>) {
  statusOf = fn;
}

/** Loads a message whose payload was too big to send inline (set by messages.ts to avoid an import cycle). */
let loadMessage: ((id: number) => Promise<ChatEvent | null>) | null = null;
export function setMessageLoader(fn: (id: number) => Promise<ChatEvent | null>) {
  loadMessage = fn;
}

function deliver(to: number[] | "all", evt: ChatEvent | { t: "resync" }) {
  const targets = to === "all" ? [...bus.listeners.keys()] : to;
  for (const userId of targets) {
    for (const fn of bus.listeners.get(userId) ?? []) {
      try {
        fn(evt);
      } catch {
        // a closed stream; it removes itself on abort
      }
    }
  }
}

async function onNotify(payload: string | undefined) {
  if (!payload) return;
  let env: Envelope;
  try {
    env = JSON.parse(payload);
  } catch {
    return;
  }
  if (env.visitor && env.vevt) {
    for (const fn of bus.visitors.get(env.visitor) ?? []) {
      try {
        fn(env.vevt);
      } catch {
        // a closed stream
      }
    }
    return;
  }
  if (env.evt) return deliver(env.to, env.evt);
  if (env.messageId && loadMessage) {
    const evt = await loadMessage(env.messageId).catch(() => null);
    if (evt) deliver(env.to, evt);
  }
}

function connect(): Promise<void> {
  if (bus.client) return Promise.resolve();
  if (bus.connecting) return bus.connecting;
  bus.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const retry = () => {
      if (bus.client !== client) return;
      bus.client = null;
      client.end().catch(() => {});
      // streams stay open; once we are back, tell every browser to re-read what it may have missed
      setTimeout(() => connect().then(() => deliver("all", { t: "resync" })).catch(() => {}), 2000);
    };
    client.on("notification", (n) => void onNotify(n.payload));
    client.on("error", retry);
    client.on("end", retry);
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    bus.client = client;
  })().finally(() => {
    bus.connecting = null;
  });
  return bus.connecting;
}

/** Sends an event to these users' open portal tabs (in every process). Call it after the change is committed. */
export async function publish(to: number[] | "all", evt: ChatEvent): Promise<void> {
  if (Array.isArray(to) && !to.length) return;
  let payload = JSON.stringify({ to, evt } satisfies Envelope);
  if (Buffer.byteLength(payload) > MAX_PAYLOAD) {
    if (evt.t !== "message.new") return; // only messages can be big
    payload = JSON.stringify({ to, messageId: evt.message.id } satisfies Envelope);
  }
  try {
    await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, payload]);
  } catch (e) {
    // the message is saved either way; browsers pick it up when they next load the conversation
    console.error("[chat] publish failed", e);
  }
}

/** Sends an event to a website visitor's open widget (in every process). */
export async function publishToVisitor(chatId: number, evt: VisitorEvent): Promise<void> {
  const payload = JSON.stringify({ to: [], visitor: chatId, vevt: evt } satisfies Envelope);
  if (Buffer.byteLength(payload) > MAX_PAYLOAD) return; // lines are capped well below this; the widget re-reads on reconnect
  try {
    await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, payload]);
  } catch (e) {
    console.error("[chat] publish to visitor failed", e);
  }
}

/** Starts listening for a website visitor's events (one call per open widget). Returns the function that stops it. */
export function subscribeVisitor(chatId: number, fn: VisitorListener): () => void {
  void connect().catch((e) => console.error("[chat] listen failed", e));
  let set = bus.visitors.get(chatId);
  if (!set) bus.visitors.set(chatId, (set = new Set()));
  set.add(fn);
  return () => {
    const s = bus.visitors.get(chatId);
    s?.delete(fn);
    if (s && !s.size) bus.visitors.delete(chatId);
  };
}

/** True while the visitor has the widget open in this process. */
export const visitorConnected = (chatId: number) => !!bus.visitors.get(chatId)?.size;

/** Starts listening for a user's events (one call per open browser tab). Returns the function that stops it. */
export function subscribe(userId: number, fn: Listener): () => void {
  void connect().catch((e) => console.error("[chat] listen failed", e));
  let set = bus.listeners.get(userId);
  if (!set) {
    bus.listeners.set(userId, (set = new Set()));
    void statusOf(userId)
      .catch(() => "online" as const)
      .then((status) => publish("all", { t: "presence", userId, status }));
  }
  set.add(fn);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const s = bus.listeners.get(userId);
    s?.delete(fn);
    if (s && !s.size) {
      bus.listeners.delete(userId);
      // a page reload closes the stream for a moment; only say "offline" if they do not come back
      setTimeout(() => {
        if (!bus.listeners.get(userId)?.size) {
          bus.away.delete(userId);
          void publish("all", { t: "presence", userId, status: "offline" });
        }
      }, 10_000);
    }
  };
}

/** Closes the LISTEN connection (scripts and tests that need the process to exit). */
export async function closeBus(): Promise<void> {
  const client = bus.client;
  bus.client = null; // stops the reconnect
  await client?.end();
}

/** Marks someone away (tab in the background) or back. Returns true when it changed. */
export function setAway(userId: number, away: boolean): boolean {
  if (away === bus.away.has(userId)) return false;
  if (away) bus.away.add(userId);
  else bus.away.delete(userId);
  return true;
}
export const isAway = (userId: number) => bus.away.has(userId);

/** People with the portal open in this process right now. */
export function onlineUserIds(): number[] {
  return [...bus.listeners.keys()];
}
