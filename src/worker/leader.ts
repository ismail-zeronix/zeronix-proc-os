import { pool } from "@/db";

/** The Postgres advisory lock only the running worker holds (any fixed number, used nowhere else). */
const WORKER_LOCK = 741902700;
const RETRY_MS = 60_000;

/**
 * Waits until this process is the only worker: it holds a session-level advisory lock on a connection it keeps open.
 * A second worker (a web container with RUN_WORKER left on, a second replica) waits here instead of running the same
 * jobs twice, and takes over within a minute if the first one stops. On startup the worker puts jobs that were "running"
 * back in the queue; that is only safe because no other worker can be running them.
 */
export async function becomeLeader(): Promise<void> {
  for (let first = true; ; first = false) {
    const client = await pool.connect().catch((e: Error) => {
      console.error("[worker] cannot reach the database:", e.message);
      return null;
    });
    if (client) {
      try {
        const r = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [WORKER_LOCK]);
        if (r.rows[0]?.ok) {
          client.on("error", (e) => {
            // the lock went with the connection: stop, so a restart (Docker) starts clean instead of running alongside a new leader
            console.error("[worker] lost the worker lock:", e.message);
            if (process.env.WORKER_ONLY === "true") process.exit(1);
          });
          if (!first) console.log("[worker] took over as the worker");
          return; // the client stays checked out for the life of the process: that is the lock
        }
      } catch (e) {
        console.error("[worker] lock check failed:", (e as Error).message);
      }
      client.release();
    }
    if (first) console.log("[worker] another process is the worker; waiting");
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
}
