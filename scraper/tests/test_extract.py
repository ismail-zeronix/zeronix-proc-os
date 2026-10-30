from datetime import date

from parsel import Selector

from zx_scraper.extract import clean_email, health_from, page_data

PAGE = """
<html><head>
<title>Contact us | Acme Trading</title>
<meta name="viewport" content="width=device-width">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Acme Trading","telephone":"+971 4 323 4567",
 "email":"info@acme.ae","sameAs":["https://www.linkedin.com/company/acme-trading/"],
 "address":{"@type":"PostalAddress","streetAddress":"Office 12, Bay Square","addressLocality":"Dubai","addressCountry":"AE"},
 "employee":[{"@type":"Person","name":"Sara Khan","jobTitle":"Managing Director"}]}
</script>
<script>var x = "tracking@sentry.io";</script>
</head><body>
<h1>Talk to us</h1>
<p>Sales: <a href="mailto:sales@acme.ae?subject=Hi">sales@acme.ae</a></p>
<p>Accounts: accounts [at] acme [dot] ae</p>
<p>Call 04 765 4321 or <a href="tel:+971501234567">our mobile</a></p>
<img src="logo@2x.png">
<div class="team"><h3>Omar Hassan</h3><p>Head of IT</p></div>
<p>Rami Saeed - Operations Manager</p>
<footer>© 2018 Acme Trading LLC</footer>
</body></html>
"""


def test_finds_emails_from_links_text_obfuscation_and_schema():
    d = page_data("https://acme.ae/contact", PAGE)
    assert set(d["emails"]) == {"sales@acme.ae", "accounts@acme.ae", "info@acme.ae"}


def test_finds_uae_phones_in_international_format():
    d = page_data("https://acme.ae/contact", PAGE)
    assert "+971 4 765 4321" in d["phones"]
    assert "+971 50 123 4567" in d["phones"]
    assert "+971 4 323 4567" in d["phones"]


def test_finds_people_with_titles():
    people = {p["name"]: p["title"] for p in page_data("https://acme.ae/team", PAGE)["people"]}
    assert people["Sara Khan"] == "Managing Director"
    assert people["Omar Hassan"] == "Head of IT"
    assert people["Rami Saeed"] == "Operations Manager"


def test_linkedin_and_address_from_schema():
    d = page_data("https://acme.ae/", PAGE)
    assert d["linkedin"] == "https://www.linkedin.com/company/acme-trading"
    assert "Dubai" in d["address"]


def test_drops_junk_addresses():
    assert clean_email("logo@2x.png") is None
    assert clean_email("someone@example.com") is None
    assert clean_email("a1b2c3d4e5f6a7b8c9d0@sentry.io") is None
    assert clean_email("MAILTO:Sales@Acme.ae") == "sales@acme.ae"


def test_hiring_only_on_a_careers_page_that_says_so():
    careers = "<html><body><h1>Careers</h1><p>Current openings: IT Support Engineer. Apply now.</p></body></html>"
    assert page_data("https://acme.ae/careers", careers)["hiring"] is True
    assert page_data("https://acme.ae/about", careers)["hiring"] is False
    assert page_data("https://acme.ae/careers", "<html><body>No vacancies posted.</body></html>")["hiring"] is False


def test_website_health():
    h = health_from("http://acme.ae/", Selector(text=PAGE), PAGE, today=date(2026, 10, 30))
    assert h["https"] is False
    assert h["mobile"] is True
    assert h["copyrightYear"] == 2018
    assert h["outdated"] is True


def test_headings_are_not_people_and_titles_are_trimmed():
    home = "<html><body><h2>Contact Us</h2><p>Trusted IT Partner in Dubai</p><h2>Why Zeronix</h2><p>Your Windows 365 Partner</p></body></html>"
    assert page_data("https://x.ae/", home)["people"] == []
    assert page_data("https://x.ae/contact", home)["people"] == []
    about = "<html><body><h3>Ismail Thasreef</h3><p>Development Lead &amp;</p></body></html>"
    assert page_data("https://x.ae/about.php", about)["people"] == [
        {"name": "Ismail Thasreef", "title": "Development Lead", "email": "", "source": "https://x.ae/about.php"}
    ]
