import type { Logger } from "drizzle-orm/logger";
import { cache } from "react";

/**
 * A measuring tool for development: with DB_QUERY_LOG=1 the server prints how many queries each page request ran
 * ("[db] 14 queries"), once the response is sent; DB_QUERY_LOG=2 also lists them. It counts per request through React's
 * request cache, so it works for pages and server actions; in a route handler each query prints on its own line, and
 * outside a request (the worker, scripts) it prints nothing. Off in production.
 */
const perRequest = cache(() => ({ n: 0, scheduled: false, lines: [] as string[] }));

const mode = process.env.DB_QUERY_LOG;

export const queryLogger: Logger | undefined =
  mode === "1" || mode === "2"
    ? {
        logQuery(query) {
          const c = perRequest();
          c.n++;
          if (mode === "2") c.lines.push(query.replace(/\s+/g, " ").slice(0, 140));
          if (c.scheduled) return;
          c.scheduled = true;
          void import("next/server")
            .then(({ after }) =>
              after(() => console.log(`[db] ${c.n} queries${c.lines.length ? "\n  " + c.lines.join("\n  ") : ""}`)),
            )
            .catch(() => {});
        },
      }
    : undefined;
