import "server-only";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { pool } from "@/db";
import type { Tx } from "@/lib/tx";

/**
 * Each company's configuration (settings, branding, the organisation row), kept in memory between requests, so a page
 * does not read the same rows again on every visit.
 *
 * - Keyed by organisation and part, so one company's copy is never handed to another.
 * - Every write calls configChanged(): the copy in this process is dropped at once, and a NOTIFY tells every process
 *   (this one too, the worker, more web servers later) to drop its copy. Sent inside a transaction, the NOTIFY only goes
 *   out when it commits, so a copy read while the change was still open is dropped as well.
 * - A copy is kept at most TTL_MS, in case a NOTIFY was missed.
 * - Posting and numbering code reads inside its own transaction and never relies on this.
 * - Off in tests unless a test turns it on (tests write settings straight into the table).
 */
export type ConfigPart = "settings" | "brand" | "org";

const TTL_MS = 10 * 60_000;
const CHANNEL = "zx_config";

type Entry = { at: number; value: Promise<unknown> };
const state = globalThis as unknown as {
  zxOrgConfig?: { entries: Map<string, Entry>; listener: Client | null; connecting: Promise<void> | null; enabled: boolean };
};
const cfg = (state.zxOrgConfig ??= { entries: new Map(), listener: null, connecting: null, enabled: process.env.VITEST !== "true" });

const keyOf = (orgId: number, part: ConfigPart) => `${orgId}:${part}`;

/** The cached value of one part of a company's configuration, loaded with `load` when there is none. */
export function orgCached<T>(orgId: number, part: ConfigPart, load: () => Promise<T>): Promise<T> {
  if (!cfg.enabled) return load();
  listen();
  const key = keyOf(orgId, part);
  const hit = cfg.entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  const entry: Entry = { at: Date.now(), value };
  cfg.entries.set(key, entry);
  // a failed read is not kept
  value.catch(() => {
    if (cfg.entries.get(key) === entry) cfg.entries.delete(key);
  });
  return value;
}

function drop(payload: string) {
  if (payload === "*") return cfg.entries.clear();
  const [org, part] = payload.split(":");
  if (part) cfg.entries.delete(`${org}:${part}`);
  else for (const k of [...cfg.entries.keys()]) if (k.startsWith(`${org}:`)) cfg.entries.delete(k);
}

/**
 * Call after changing a company's settings, branding or organisation row. With `tx`, the other processes hear of it
 * when the transaction commits.
 */
export async function configChanged(orgId: number, part?: ConfigPart, tx?: Tx): Promise<void> {
  const payload = part ? keyOf(orgId, part) : String(orgId);
  drop(payload);
  try {
    if (tx) await tx.execute(sql`SELECT pg_notify(${CHANNEL}, ${payload})`);
    else await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, payload]);
  } catch (e) {
    // this process already dropped its copy; the others catch up within TTL_MS
    console.error("[config] notify failed", e);
  }
}

/** One LISTEN connection per process, opened the first time the cache is used. */
function listen() {
  if (cfg.listener || cfg.connecting || !process.env.DATABASE_URL || process.env.NEXT_PHASE === "phase-production-build") return;
  cfg.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const retry = () => {
      if (cfg.listener !== client) return;
      cfg.listener = null;
      cfg.entries.clear(); // we may have missed a change while away
      client.end().catch(() => {});
      setTimeout(listen, 5000);
    };
    client.on("notification", (n) => n.payload && drop(n.payload));
    client.on("error", retry);
    client.on("end", retry);
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    cfg.listener = client;
  })()
    .catch((e) => console.error("[config] listen failed", e))
    .finally(() => {
      cfg.connecting = null;
    });
}

/** For tests: turn the cache on or off, and empty it. */
export function setOrgConfigCache(on: boolean): void {
  cfg.enabled = on;
  cfg.entries.clear();
}

/** For tests and scripts that need the process to exit. */
export async function closeOrgConfig(): Promise<void> {
  const client = cfg.listener;
  cfg.listener = null;
  await client?.end().catch(() => {});
}
