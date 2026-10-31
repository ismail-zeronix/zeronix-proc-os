# Prospecting website reader

A small Python service for the Prospecting app. When someone presses **Research** or **Research with AI** on prospects,
the portal queues a row per prospect in `prospect_research_runs`; this service takes them, reads each company's own
website politely and stores what it found. The portal then updates the prospect; with **Research with AI** it also lets
a free AI model read the pages and searches the web for the people who run the company.

- `zx_scraper/extract.py`: pulls emails, phones, people with titles, the LinkedIn page, hiring pages and website
  health out of one page (pure functions, tested in `tests/`).
- `zx_scraper/crawl.py`: Scrapy spider for one domain. Homepage first, then contact, about, team and careers pages; at
  most 15 pages, one request at a time with a delay, robots.txt obeyed, no logins, no captchas.
- `zx_scraper/worker.py`: the queue loop (`FOR UPDATE SKIP LOCKED`); each site is read in its own process, three sites at
  a time (`SCRAPER_WORKERS`, 1-6). Runs stuck in `crawling` for 10 minutes go back in the queue.

Run it with Docker (Python is not needed on the host):

    docker compose up -d --build scraper
    docker compose run --rm scraper python -m zx_scraper.crawl example.ae   # read one site by hand
    docker compose run --rm scraper python -m pytest -q                     # tests

Only public business contact details are kept, each with the page it came from (UAE PDPL). LinkedIn and Google Maps
are never read.
