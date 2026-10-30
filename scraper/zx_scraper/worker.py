"""Takes queued research runs from Postgres one at a time, reads each company website, and stores what was found.

The portal queues runs (prospect_research_runs.status = 'queued') and applies the results; this process only crawls.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

import psycopg

CRAWL_TIMEOUT = 150
IDLE_SECONDS = 3


def take(conn: psycopg.Connection):
    return conn.execute(
        """
        UPDATE prospect_research_runs SET status = 'crawling', started_at = now()
        WHERE id = (
          SELECT id FROM prospect_research_runs
          WHERE status = 'queued' AND domain <> ''
          ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING id, domain
        """
    ).fetchone()


def run_crawl(domain: str) -> tuple[dict, str]:
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "zx_scraper.crawl", domain],
            capture_output=True,
            text=True,
            timeout=CRAWL_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return {}, "The website took too long to read."
    lines = [l for l in proc.stdout.strip().splitlines() if l.startswith("{")]
    if not lines:
        tail = (proc.stderr or "").strip().splitlines()[-1:] or ["no output"]
        return {}, f"The scraper stopped: {tail[0][:200]}"
    data = json.loads(lines[-1])
    if "error" in data and len(data) == 1:
        return {}, data["error"]
    return data, ""


def main() -> None:
    dsn = os.environ["DATABASE_URL"]
    print("[scraper] waiting for research runs", flush=True)
    while True:
        try:
            with psycopg.connect(dsn, autocommit=True) as conn:
                # runs left half-done by a restart go back in the queue
                conn.execute("UPDATE prospect_research_runs SET status = 'queued' WHERE status = 'crawling' AND started_at < now() - interval '10 minutes'")
                while True:
                    job = take(conn)
                    if not job:
                        time.sleep(IDLE_SECONDS)
                        continue
                    run_id, domain = job
                    started = time.time()
                    data, error = run_crawl(domain)
                    if not data.get("pages") and not error:
                        error = "No page of the website could be read." + (" Its robots rules block readers." if data.get("robotsBlocked") else "")
                    conn.execute(
                        "UPDATE prospect_research_runs SET status = 'crawled', result = %s::jsonb, error = %s, pages_read = %s WHERE id = %s",
                        (json.dumps(data), error, len(data.get("pages", [])), run_id),
                    )
                    print(f"[scraper] run {run_id} {domain}: {len(data.get('pages', []))} pages, "
                          f"{len(data.get('emails', []))} emails, {len(data.get('phones', []))} phones in {time.time() - started:.0f}s {error}", flush=True)
        except psycopg.OperationalError as e:
            print(f"[scraper] database unavailable, retrying: {e}", flush=True)
            time.sleep(10)


if __name__ == "__main__":
    main()
