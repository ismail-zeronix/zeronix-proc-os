# Zeronix Tech: SEO research and content plan (first pass, 2026-11-02)

**Who this is for:** the people who write and publish posts for zeronixtech.com.
**How it was made:** a reading of Google results for UAE business IT searches, plus competitor and retailer pages. No paid keyword tool was used. Search volumes are therefore not given; priorities come from **buyer intent** and from **how weak the current results are**. Search Console replaces the guesswork with real numbers about four weeks after go-live (Website › SEO).

The keyword list that goes with this file is `keywords.csv` (import it in Website › SEO).

---

## 1. What the search results show

**1. "Best laptops for <industry>" has no UAE answer.**
- Results for "best laptops for real estate agents Dubai" are global pages: Lenovo's knowledge base, Best Buy Canada, US blogs, and some 2021–2023 posts.
- None of them mentions UAE stock, Middle East warranty, Arabic/English keyboards, VAT invoices or buying for a team.
- The same holds for architects (Canadian and Pakistani guides), law firms (South African and UK pages) and clinics (software vendors only).

**This is the gap the site is built for:** industry-specific, UAE-specific and written for a company buying 5–50 machines.

**2. UAE results are consumer or retail.**
- Gulf News, tbreak and Sharaf DG rank for "best laptops UAE", but they write for one buyer with one budget ("under Dh2,500", "MacBook Air M5 from AED 5,299").
- Corporate buying questions go unanswered:
  - which warranty, and whether it is valid when the machine travels;
  - how much to standardise across the team;
  - TPM and BitLocker;
  - lead times;
  - quantities and VAT invoices.

**3. B2B supplier results are thin and look untrustworthy.**
- "Corporate laptop supplier Dubai" returns Blogspot posts, Mixcloud and Hackernoon profiles, and directory listings.
- A clear, expert supplier page with real guides will stand out to buyers, and to Google's "helpful content" and E-E-A-T signals.

**4. Questions buyers really ask that nobody answers well:**
- **Warranty:** Is a laptop bought in Dubai covered abroad? Forum threads show that the HP, Dell, Lenovo and Apple policies differ, and that Middle-East-only models can be refused service in other countries.
- **Keyboards:** Arabic/English or English-only? No UAE source answers this clearly.
- **Law firms:** What does the UAE data protection law (Federal Decree-Law No. 45 of 2021) mean for client data on laptops? The answer is encryption, TPM 2.0 and BitLocker; the law does not name any hardware.
- **Clinics:** DHA requires a NABIDH connection, and the EMR vendor decides which operating systems and browsers are supported. Clinics ask what the front desk and doctors' rooms need.
- **Architects:** Revit needs strong single-core speed, 32–64 GB of RAM and an Autodesk-certified GPU. People ask whether a laptop is enough or a tower is needed.
- **New companies:** "IT equipment for a new office in Dubai": the pages that rank are service pitches with no product guidance.

**5. AI answers (ChatGPT, Perplexity, Google AI Overviews)** quote pages that:
- give a direct answer in the first paragraph;
- have a clear comparison table;
- have a real FAQ with short answers;
- name the author and their role.

Our guide template already has picks, a comparison table, an FAQ and a byline. Keep every guide that way.

---

## 2. Content clusters (in order of priority)

| # | Cluster | Hub page (exists) | First posts | Why first |
| --- | --- | --- | --- | --- |
| 1 | **Buying business laptops in the UAE** (pillar) | /products/laptops | "Business laptops in the UAE: the 2026 buying guide for companies" | Every industry guide links up to it; it answers warranty, keyboard, VAT and quantity questions once |
| 2 | Real estate | /industries/real-estate | "Best laptops for real estate agents in the UAE (2026)" | Huge agent workforce in Dubai, mobile-first, buys in teams, weak results |
| 3 | Architecture & design | /industries/architecture-design | "Laptops and workstations for architects in the UAE: Revit, AutoCAD, Enscape" | High order value (workstations), clear technical intent |
| 4 | Legal | /industries/legal | "Laptops for law firms in the UAE: security, encryption and the data protection law" | Security angle nobody covers locally; high trust buyers |
| 5 | Healthcare & clinics | /industries/healthcare | "Computers for clinics in Dubai: front desk, doctors' rooms and NABIDH" | Many new clinics, recurring orders, no product guidance ranks |
| 6 | Finance & accounting | /industries/finance | "Best laptops for accountants and finance teams in the UAE" | Excel-heavy, dual monitor, docking: easy bundle sales |
| 7 | New office / company setup | /quote | "IT equipment checklist for a new office in Dubai" (next batch) | Captures founders at the moment of buying |
| 8 | Warranty & keyboards (support) | — | "Middle East vs international laptop warranty, explained" (next batch) | Pure question traffic; links to every product page |

**Next batch (posts 7–12):**
- the new office IT checklist;
- warranty explained;
- Arabic/English keyboards;
- laptop vs desktop for an office team;
- engineering & construction;
- education.

---

## 3. Rules for every post (on-page)
- **Title:** the primary keyword near the front and "UAE" or "Dubai"; 60 characters or fewer.
- **Meta description:** 155 characters or fewer; promise the answer and mention B2B pricing.
- **First paragraph:** the direct answer (which machine, for whom, why) in 2–3 sentences.
- **Picks:** 3–4 real models that are **sold in the UAE**, each with:
  - a part number and a `source_url` to the brand's spec page;
  - a "best for" label;
  - a verdict, and pros and cons.
- **Body:**
  - a comparison table (`{{compare}}`);
  - a "what to look for" section in plain words;
  - UAE notes (warranty, keyboard, delivery, VAT invoice);
  - an FAQ of 4–6 questions with answers of 2–3 sentences.
- **Links:**
  - up to the pillar and the industry hub;
  - across to one sibling guide;
  - down to each product page.
- **Calls to action:** `{{cta}}` after the picks and at the end, plus "Quote all picks for my team".
- **Byline:** the uploader's name and role. Add a short bio in Website › Authors once that screen exists.
- **Freshness:** re-check the specs every 6 months (the checklist warns), and put the year in the title.

## 4. Measuring it
- **Website › Overview:** sessions from Google and AI assistants, and leads per landing page.
- **Website › SEO** (after Search Console is connected):
  - the position of each keyword;
  - queries in positions 8–30, which need a better page;
  - pages with many impressions and a low CTR, which need a better title.
- **Target for the first 90 days:** 6 posts live in week 1, then 2 a week. The first leads from organic search should arrive in month 2 or 3.

## 5. Sources read
- Google results for: business laptops UAE corporate; best laptops for real estate agents Dubai; workstation for architects Dubai; corporate laptop supplier Dubai; laptops for law firms UAE; IT equipment for a new company in Dubai; Middle East vs international warranty; clinic computers Dubai DHA (all on 2026-11-02).
- Pages:
  - tbreak.com, "best laptops in the UAE" and "best business laptop UAE";
  - Gulf News best buys;
  - Sharaf DG business laptops;
  - Lenovo, "How to evaluate the best laptop for real estate agents";
  - archeyes.com, laptops for architects;
  - kolonell.com (law firm data, Dubai 2026);
  - alkabban.com (UAE data protection for professional firms);
  - HP Imagine 2026 TPM Guard (mid-east.info);
  - glocertinternational.com and codingclave.com on NABIDH;
  - bigapplebuddy.com, warranty when buying in the UAE.
