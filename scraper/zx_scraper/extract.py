"""Pulls public business contact details out of one web page. Pure functions: no network, easy to test."""

from __future__ import annotations

import json
import re
from datetime import date
from urllib.parse import urljoin, urlparse

import phonenumbers
from parsel import Selector

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}")
# "sales [at] example [dot] ae" and friends
AT_RE = re.compile(r"\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\})\s*", re.I)
DOT_RE = re.compile(r"\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\})\s*", re.I)
JUNK_DOMAINS = {
    "example.com", "example.ae", "domain.com", "email.com", "yourdomain.com", "yourcompany.com", "company.com",
    "sentry.io", "wixpress.com", "sentry.wixpress.com", "sentry-next.wixpress.com", "godaddy.com", "w3.org",
    # placeholders left in website templates and contact forms
    "myemail.com", "youremail.com", "yoursite.com", "yourwebsite.com", "mysite.com", "mydomain.com", "website.com",
    "test.com", "sample.com", "emailaddress.com", "mail.example.com",
}
JUNK_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js", ".ico")
ROLE_RE = re.compile(
    r"\b(founder|co-?founder|owner|partner|ceo|cto|cfo|coo|cio|chief|president|chairman|director|managing|manager|head of|"
    r"general manager|gm|principal|officer|vice president|vp|supervisor|lead|administrator|coordinator)\b",
    re.I,
)
NAME_RE = re.compile(r"^(?:(?:Mr|Mrs|Ms|Dr|Eng|Engr)\.?\s+)?[A-Z][a-zA-Z'’-]+(?:\s+(?:[A-Z][a-zA-Z'’-]+|bin|bint|al|Al|el|El|van|de)){1,4}$")
HIRING_RE = re.compile(r"\b(vacanc(?:y|ies)|we(?:'re| are) hiring|job openings?|open positions?|current openings?|apply now|join our team)\b", re.I)
NOT_HIRING_RE = re.compile(r"\bno (?:current |open )?(?:vacanc(?:y|ies)|openings?|positions?)\b", re.I)
COPYRIGHT_RE = re.compile(r"(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})", re.I)
SKIP_FILE = re.compile(r"\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|avi|mov)(\?|$)", re.I)


def visible_text(sel: Selector) -> list[str]:
    """Text a visitor sees, one block per element, scripts and styles left out."""
    parts = sel.xpath("//body//text()[not(ancestor::script) and not(ancestor::style) and not(ancestor::noscript)]").getall()
    out = []
    for p in parts:
        t = re.sub(r"\s+", " ", p).strip()
        if t:
            out.append(t)
    return out


def clean_email(raw: str) -> str | None:
    e = raw.strip().strip(".,;:").lower()
    if e.startswith("mailto:"):
        e = e[7:]
    e = e.split("?")[0]
    if not EMAIL_RE.fullmatch(e):
        return None
    local, _, dom = e.partition("@")
    if dom in JUNK_DOMAINS or e.endswith(JUNK_SUFFIX) or re.search(r"@\d+x\.", e):
        return None
    # hashes and ids that look like emails (sentry keys, tracking ids)
    if len(local) > 40 or re.fullmatch(r"[0-9a-f]{16,}", local):
        return None
    return e


def emails_from(sel: Selector, text: str) -> list[str]:
    found: list[str] = []
    for href in sel.xpath("//a[starts-with(translate(@href,'MAILTO','mailto'),'mailto:')]/@href").getall():
        for part in href[7:].split(","):
            e = clean_email(part)
            if e:
                found.append(e)
    plain = DOT_RE.sub(".", AT_RE.sub("@", text))
    for m in EMAIL_RE.findall(plain):
        e = clean_email(m)
        if e:
            found.append(e)
    return list(dict.fromkeys(found))


def phones_from(sel: Selector, text: str, region: str = "AE") -> list[str]:
    """Valid phone numbers in international format (+971 4 123 4567). Numbers without a country code are read as UAE."""
    found: list[str] = []
    candidates = [h[4:] for h in sel.xpath("//a[starts-with(@href,'tel:')]/@href").getall()]
    for raw in candidates:
        try:
            n = phonenumbers.parse(raw, region)
            if phonenumbers.is_valid_number(n):
                found.append(phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.INTERNATIONAL))
        except phonenumbers.NumberParseException:
            pass
    for m in phonenumbers.PhoneNumberMatcher(text, region, leniency=phonenumbers.Leniency.VALID):
        found.append(phonenumbers.format_number(m.number, phonenumbers.PhoneNumberFormat.INTERNATIONAL))
    return list(dict.fromkeys(found))


def _jsonld(sel: Selector) -> list[dict]:
    items: list[dict] = []
    for raw in sel.xpath("//script[@type='application/ld+json']/text()").getall():
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            d = stack.pop()
            if isinstance(d, dict):
                items.append(d)
                for k in ("@graph", "employee", "founder", "member", "author", "contactPoint"):
                    v = d.get(k)
                    if isinstance(v, list):
                        stack.extend(v)
                    elif isinstance(v, dict):
                        stack.append(v)
    return items


def _types(d: dict) -> set[str]:
    t = d.get("@type", [])
    return {str(x) for x in (t if isinstance(t, list) else [t])}


PEOPLE_PAGE_RE = re.compile(r"team|people|about|management|leadership|board|founder|who-we-are|our-story|contact", re.I)
# words that start headings and buttons, never a name
NOT_NAME = {
    "contact", "us", "about", "why", "our", "the", "your", "home", "welcome", "get", "in", "touch", "read", "more", "learn",
    "services", "service", "solutions", "solution", "products", "team", "meet", "careers", "news", "blog", "privacy",
    "policy", "terms", "request", "quote", "book", "call", "send", "message", "follow", "view", "all", "office", "location",
    "support", "sales", "partner", "partners", "trusted", "best", "top", "new", "free", "it", "and", "of", "for", "with",
    "who", "we", "are", "what", "how", "where", "when", "is", "a", "one", "do", "let", "lets", "find", "explore", "discover",
}
# a slogan, not a job title ("Your One-Stop IT Solutions Partner")
SLOGAN_RE = re.compile(r"\b(your|our|we|solutions?|services?|one-stop|trusted|leading|best)\b", re.I)


def is_name(s: str) -> bool:
    return bool(NAME_RE.match(s)) and not any(w.lower().strip(".'’") in NOT_NAME for w in s.split())


def is_title(s: str) -> bool:
    return len(s) <= 60 and bool(ROLE_RE.search(s)) and not SLOGAN_RE.search(s)


def clean_title(s: str) -> str:
    return re.sub(r"[\s&,;:|/-]+$", "", s).strip()


def people_from(sel: Selector, blocks: list[str], url: str) -> list[dict]:
    """Named people with a job title: schema.org Person first, then "Name" followed by a title on team pages."""
    people: list[dict] = []
    for d in _jsonld(sel):
        if "Person" in _types(d) and isinstance(d.get("name"), str):
            title = d.get("jobTitle") if isinstance(d.get("jobTitle"), str) else ""
            email = clean_email(str(d.get("email", ""))) or ""
            people.append({"name": d["name"].strip(), "title": title.strip(), "email": email, "source": url})
    # the text patterns only on pages about people; elsewhere headings ("Contact Us", "Why Zeronix") look like names
    if not PEOPLE_PAGE_RE.search(url):
        blocks = []
    for i, b in enumerate(blocks):
        if len(b) > 60:
            continue
        # "Ahmed Ali - Operations Manager" on one line
        parts = re.split(r"\s+[-–—|,]\s+", b, maxsplit=1)
        if len(parts) == 2 and is_name(parts[0]) and is_title(parts[1]):
            people.append({"name": parts[0], "title": clean_title(parts[1]), "email": "", "source": url})
            continue
        # "Ahmed Ali" then "Operations Manager" in the next block
        if is_name(b) and not ROLE_RE.search(b) and i + 1 < len(blocks):
            nxt = blocks[i + 1]
            if is_title(nxt) and not is_name(nxt):
                people.append({"name": b, "title": clean_title(nxt), "email": "", "source": url})
    seen: dict[str, dict] = {}
    for p in people:
        key = p["name"].lower()
        if key not in seen or (not seen[key]["title"] and p["title"]):
            seen[key] = p
    return list(seen.values())


def organisation_from(sel: Selector) -> dict:
    """Phone, email, address and social links an organisation publishes about itself in schema.org data."""
    out: dict = {"emails": [], "phones": [], "sameAs": [], "address": ""}
    for d in _jsonld(sel):
        if not ({"Organization", "LocalBusiness", "Corporation", "ContactPoint"} & _types(d) or any(t.endswith("Business") for t in _types(d))):
            continue
        for k in ("email",):
            e = clean_email(str(d.get(k, "")))
            if e:
                out["emails"].append(e)
        if d.get("telephone"):
            out["phones"].append(str(d["telephone"]))
        same = d.get("sameAs", [])
        out["sameAs"].extend(same if isinstance(same, list) else [same])
        addr = d.get("address")
        if isinstance(addr, dict) and not out["address"]:
            out["address"] = ", ".join(str(addr.get(k, "")).strip() for k in ("streetAddress", "addressLocality", "addressRegion", "addressCountry") if addr.get(k))
        elif isinstance(addr, str) and not out["address"]:
            out["address"] = addr
    return out


def linkedin_from(sel: Selector, extra: list) -> str:
    """The company's LinkedIn page, if it links to one."""
    for href in [*sel.xpath("//a/@href").getall(), *[str(x) for x in extra]]:
        if re.search(r"linkedin\.com/company/[^/?#]+", href, re.I):
            m = re.search(r"https?://[a-z.]*linkedin\.com/company/[^/?#\"']+", href, re.I)
            if m:
                return m.group(0).rstrip("/")
    return ""


def health_from(url: str, sel: Selector, raw_html: str, today: date | None = None) -> dict:
    """Signs of a weak website (a lead for our website services)."""
    today = today or date.today()
    years = [int(y) for y in COPYRIGHT_RE.findall(raw_html)]
    generator = sel.xpath("//meta[@name='generator']/@content").get() or ""
    return {
        "https": urlparse(url).scheme == "https",
        "mobile": bool(sel.xpath("//meta[@name='viewport']").get()),
        "copyrightYear": max(years) if years else None,
        "generator": generator[:80],
        "outdated": bool(years) and max(years) < today.year - 2,
    }


EMIRATE_RE = re.compile(r"\b(dubai|abu dhabi|sharjah|ajman|umm al quwain|ras al khaimah|fujairah|al ain)\b", re.I)
PLACE_RE = re.compile(
    r"\b(street|st\.|road|rd\.|building|bldg|tower|floor|office|shop|block|plot|p\.?\s?o\.?\s?box|area|district|business bay|free ?zone|warehouse|villa)\b",
    re.I,
)


def address_from(blocks: list[str]) -> str:
    """A postal address printed as text ("Office 12, Damascus Street - Al Qusais - Dubai"): an emirate plus a street word."""
    for b in blocks:
        if 15 <= len(b) <= 200 and EMIRATE_RE.search(b) and PLACE_RE.search(b) and not EMAIL_RE.search(b) and "http" not in b:
            return b
    return ""


def links_from(sel: Selector, base_url: str) -> list[tuple[str, str]]:
    """(absolute url, link text) for every ordinary link on the page."""
    out = []
    for a in sel.xpath("//a[@href]"):
        href = (a.attrib.get("href") or "").strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#", "whatsapp:")) or SKIP_FILE.search(href):
            continue
        text = re.sub(r"\s+", " ", " ".join(a.xpath(".//text()").getall())).strip()
        out.append((urljoin(base_url, href).split("#")[0], text[:80]))
    return out


def page_data(url: str, html: str) -> dict:
    """Everything useful on one page."""
    sel = Selector(text=html)
    blocks = visible_text(sel)
    text = "\n".join(blocks)
    org = organisation_from(sel)
    phones = phones_from(sel, text)
    for raw in org["phones"]:
        try:
            n = phonenumbers.parse(raw, "AE")
            if phonenumbers.is_valid_number(n):
                phones.append(phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.INTERNATIONAL))
        except phonenumbers.NumberParseException:
            pass
    is_careers = bool(re.search(r"career|jobs?\b|vacanc|join-us|work-with-us", url, re.I))
    return {
        "url": url,
        "emails": list(dict.fromkeys(emails_from(sel, text) + org["emails"])),
        "phones": list(dict.fromkeys(phones)),
        "people": people_from(sel, blocks, url),
        "linkedin": linkedin_from(sel, org["sameAs"]),
        # schema.org data first; otherwise the printed address, only on contact and location pages
        "address": org["address"] or (address_from(blocks) if re.search(r"contact|location|office|find-us|reach", url, re.I) else ""),
        "hiring": is_careers and bool(HIRING_RE.search(text)) and not NOT_HIRING_RE.search(text),
        "title": (sel.xpath("//title/text()").get() or "").strip()[:150],
        "chars": len(text),
        # kept for the portal's free AI reading step when the patterns above find nothing
        "text": text[:4000],
    }
