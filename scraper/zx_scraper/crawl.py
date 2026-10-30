"""Reads one company website politely and prints what it found as JSON on the last line of stdout.

    python -m zx_scraper.crawl example.ae

Runs in its own process for each company (Scrapy's reactor cannot be restarted inside one process).
"""

from __future__ import annotations

import json
import re
import sys
from urllib.parse import urlparse

import dns.resolver
import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.http import TextResponse

from .extract import health_from, links_from, page_data
from parsel import Selector

MAX_PAGES = 15
# pages most likely to hold contacts, people and job openings
PRIORITY = re.compile(
    r"contact|reach|about|who-we-are|our-story|company|team|people|management|leadership|board|founder|career|jobs?\b|vacanc|join|location|office|branch",
    re.I,
)
USER_AGENT = "Mozilla/5.0 (compatible; ZeronixResearchBot/1.0; +https://www.zeronix.ae)"


def same_site(host: str, domain: str) -> bool:
    host = host.lower().split(":")[0]
    return host == domain or host.endswith("." + domain)


class SiteSpider(scrapy.Spider):
    name = "site"

    def __init__(self, domain: str, **kw):
        super().__init__(**kw)
        self.domain = domain.lower()
        self.site = self.domain
        self.pages: list[dict] = []
        self.health: dict | None = None
        self.queued: set[str] = set()
        self.errors: list[str] = []

    async def start(self):
        for url, prio in ((f"https://{self.domain}/", 100), (f"https://{self.domain}/contact-us", 60), (f"https://{self.domain}/contact", 59)):
            self.queued.add(url)
            yield scrapy.Request(url, callback=self.parse, errback=self.failed, priority=prio, meta={"home": prio == 100, "guess": prio != 100})

    def failed(self, failure):
        req = failure.request
        # a guessed page that does not exist is not worth reporting
        if req.meta.get("guess"):
            return
        self.errors.append(f"{req.url}: {failure.value.__class__.__name__}")
        # the https homepage did not answer: try plain http once
        if req.meta.get("home") and req.url.startswith("https://"):
            url = "http://" + req.url[8:]
            yield scrapy.Request(url, callback=self.parse, errback=self.failed, priority=100, meta={"home": False, "http_retry": True})

    def parse(self, response):
        if not isinstance(response, TextResponse) or response.status >= 400:
            return
        host = urlparse(response.url).netloc
        if response.meta.get("home") or response.meta.get("http_retry"):
            # a redirect to another domain (the company moved) makes that the site to read
            final = host.lower().split(":")[0]
            if final.startswith("www."):
                final = final[4:]
            if not same_site(final, self.domain):
                self.site = final
            if self.health is None:
                self.health = health_from(response.url, Selector(text=response.text), response.text)
        if not same_site(host, self.site) and not same_site(host, self.domain):
            return
        data = page_data(response.url, response.text)
        self.pages.append(data)
        for url, text in links_from(Selector(text=response.text), response.url):
            u = urlparse(url)
            if u.scheme not in ("http", "https") or not (same_site(u.netloc, self.site) or same_site(u.netloc, self.domain)):
                continue
            if url in self.queued or len(self.queued) >= MAX_PAGES * 3:
                continue
            important = PRIORITY.search(u.path) or PRIORITY.search(text)
            # ordinary pages only from the homepage, and after the important ones
            if not important and response.meta.get("depth", 0) >= 1:
                continue
            self.queued.add(url)
            yield response.follow(url, callback=self.parse, errback=self.failed, priority=50 if important else 1)


def has_mx(domain: str) -> bool | None:
    try:
        return bool(dns.resolver.resolve(domain, "MX", lifetime=8))
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return False
    except Exception:
        return None


def summarise(spider: SiteSpider, stats: dict) -> dict:
    emails: dict[str, str] = {}
    phones: dict[str, str] = {}
    people: dict[str, dict] = {}
    linkedin = address = ""
    hiring = ""
    for p in spider.pages:
        for e in p["emails"]:
            emails.setdefault(e, p["url"])
        for ph in p["phones"]:
            phones.setdefault(ph, p["url"])
        for person in p["people"]:
            people.setdefault(person["name"].lower(), person)
        linkedin = linkedin or p["linkedin"]
        address = address or p["address"]
        if p["hiring"] and not hiring:
            hiring = p["url"]
    js_only = bool(spider.pages) and max(p["chars"] for p in spider.pages) < 300
    return {
        "domain": spider.domain,
        "site": spider.site,
        "pages": [{"url": p["url"], "title": p["title"]} for p in spider.pages],
        "emails": [{"email": e, "source": s} for e, s in emails.items()],
        "phones": [{"phone": ph, "source": s} for ph, s in phones.items()],
        "people": list(people.values())[:20],
        "linkedin": linkedin,
        "address": address,
        "hiringPage": hiring,
        "health": spider.health,
        "mx": has_mx(spider.site),
        "jsOnly": js_only,
        "robotsBlocked": int(stats.get("robotstxt/forbidden", 0)),
        "errors": spider.errors[:5],
    }


def crawl(domain: str) -> dict:
    process = CrawlerProcess(
        settings={
            "USER_AGENT": USER_AGENT,
            "ROBOTSTXT_OBEY": True,
            "CONCURRENT_REQUESTS": 2,
            "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
            "DOWNLOAD_DELAY": 1.5,
            "RANDOMIZE_DOWNLOAD_DELAY": True,
            "AUTOTHROTTLE_ENABLED": True,
            "DOWNLOAD_TIMEOUT": 15,
            "RETRY_TIMES": 1,
            "DEPTH_LIMIT": 2,
            "CLOSESPIDER_PAGECOUNT": MAX_PAGES,
            "CLOSESPIDER_TIMEOUT": 100,
            "DOWNLOAD_MAXSIZE": 5 * 1024 * 1024,
            "COOKIES_ENABLED": False,
            "TELNETCONSOLE_ENABLED": False,
            "LOG_LEVEL": "ERROR",
            "REQUEST_FINGERPRINTER_IMPLEMENTATION": "2.7",
        }
    )
    crawler = process.create_crawler(SiteSpider)
    process.crawl(crawler, domain=domain)
    process.start()
    return summarise(crawler.spider, crawler.stats.get_stats())


if __name__ == "__main__":
    if len(sys.argv) != 2 or not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", sys.argv[1].lower()):
        print(json.dumps({"error": "usage: python -m zx_scraper.crawl example.ae"}))
        sys.exit(2)
    print(json.dumps(crawl(sys.argv[1].lower()), ensure_ascii=False))
