"""Takes queued research runs from Postgres, reads each company website, and stores what was found.

The portal queues runs (prospect_research_runs.status = 'queued') and applies the results; this process only crawls.
Several sites are read at the same time (SCRAPER_WORKERS, default 3): each is a different company, and every crawl
stays polite to its own site (one request at a time, with a delay).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time

import psycopg

CRAWL_TIMEOUT = 150
IDLE_SECONDS = 3
WORKERS = max(1, min(6, int(os.environ.get("SCRAPER_WORKERS", "3"))))


def take(conn: psycopg.Connection):
    return conn.execute(
        """
        UPDATE prospect_research_runs SET status = 'crawling', started_at = now(), stage = 'Reading the website'
        WHERE id = (
          SELECT id FROM prospect_research_runs
          WHERE status = 'queued' AND domain <> ''
          ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING id, domain
        """
    ).fetchone()


def requeue_stuck(conn: psycopg.Connection) -> None:
    """Runs left half-read by a restart or a crash go back in the queue (a crawl never takes 10 minutes)."""
    conn.execute(
        "UPDATE prospect_research_runs SET status = 'queued', stage = '' WHERE status = 'crawling' AND started_at < now() - interval '10 minutes'"
    )


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


def loop(dsn: str, n: int) -> None:
    while True:
        try:
            with psycopg.connect(dsn, autocommit=True) as conn:
                while True:
                    if n == 0:
                        requeue_stuck(conn)
                    job = take(conn)
                    if not job:
                        time.sleep(IDLE_SECONDS)
                        continue
                    run_id, domain = job
                    started = time.time()
                    data, error = run_crawl(domain)
                    if not data.get("pages") and not error:
                        error = "No page of the website could be read." + (" Its robots rules block readers." if data.get("robotsBlocked") else "")
                    # a run stopped from the portal while it was being read stays stopped
                    conn.execute(
                        "UPDATE prospect_research_runs SET status = 'crawled', stage = 'Saving what the website showed', result = %s::jsonb, error = %s, pages_read = %s "
                        "WHERE id = %s AND status = 'crawling'",
                        (json.dumps(data), error, len(data.get("pages", [])), run_id),
                    )
                    print(f"[scraper {n}] run {run_id} {domain}: {len(data.get('pages', []))} pages, "
                          f"{len(data.get('emails', []))} emails, {len(data.get('phones', []))} phones in {time.time() - started:.0f}s {error}", flush=True)
        except psycopg.OperationalError as e:
            print(f"[scraper {n}] database unavailable, retrying: {e}", flush=True)
            time.sleep(10)


def main() -> None:
    dsn = os.environ["DATABASE_URL"]
    print(f"[scraper] waiting for research runs, {WORKERS} at a time", flush=True)
    threads = [threading.Thread(target=loop, args=(dsn, i), daemon=True) for i in range(WORKERS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    main()
