# Zeronix Portal: from "Procurement app" to a simple company platform


## 1. Context

Procurement (paste/Excel/feed price lists, compare, alerts, suppliers) is finished. Zeronix now wants the rest of the sales
journey in the same system: **lead -> deal -> procurement -> quote -> closing**, plus a home screen that shows what is
happening, a knowledge panel for the sales team, and later accounts and prospecting.

Today the whole app *is* Procurement: `/` is the procurement dashboard, one sidebar, two roles (`admin`, `sales`), no
per-app access. The goal is a **portal**: a home screen with one tile per app, each app has its own small sidebar, and
admin decides which apps each user sees.

Decisions already made with you:
- **Roles stay `admin` and `sales`.** Admin ticks which apps each user can see (per-user toggles). No new roles.
- **UI: keep the current look**, improve slightly. Spend the effort on function, not styling.
- **Email widget: IMAP to the Hostinger mailbox** (read-only, latest messages on the home screen).
- Own structure, no copying of another product's layout. Plain words, few clicks, one screen per job.

## 2. Principles (to keep it simple)

1. **One tile = one app = one folder.** Adding an app later (Accounts, Prospecting) is: one registry entry + one folder.
2. **A lead and a deal are the same record at different stages.** No separate lead and deal screens to jump between.
3. **Procurement prices flow into quotes, never retyped.** A quote line can pull the best supplier cost with one click.
4. **Every list has: search box, 2-3 filters, one primary button.** No settings maze.
5. **Nothing hidden in the UI is open by URL.** Access is checked on the server for pages *and* actions.
6. **Reuse what exists**: shadcn components in `src/components/ui`, `PageHeader`, `Kpi`/`Empty` pattern from the
   dashboard, Drizzle + Postgres, the existing background worker in `src/worker/`, `copy-button`, `export.ts` quote text.

## 3. The home screen (first thing to build)

```
+--------------------------------------------------------------------------------+
| [Z] Zeronix     [::: Apps v]   [ Search... Ctrl K ]              (moon)  Ismail v|
+--------------------------------------------------------------------------------+
| Good morning, Ismail                                      Wed 21 Oct 2026        |
| "Every no brings you closer to a yes."   <- daily motivation (sales + admin)     |
|                                                                                  |
|  [Procurement] [  Sales  ] [ Accounts ] [  Tasks  ] [Knowledge] [Prospecting]    |
|   icon, name,   icon, name  (soon)       badge: 3    one line     (soon)         |
|   badge: 2 to   badge: 4                                                         |
|   review        follow-ups                                                       |
|                                                                                  |
|  THIS WEEK                                                                       |
|  [New leads 6 (+2)] [Open deals 14 / AED 420k] [Quotes sent 5] [Won 2 / 85k]     |
|  [Lists to review 2] [Price drops 11]          <- tiles depend on the user's apps|
|                                                                                  |
|  +-- My tasks today ---------------+  +-- Latest emails -----------------------+ |
|  | [ ] Call ABC Trading  10:30     |  | Ahmed (ABC)  Re: Quote ZQ-0042   9:12  | |
|  | [ ] Send quote to XYZ  overdue  |  | Dell Dist.   New price list      8:40  | |
|  | [ ] Follow up Meydan lead       |  | ...                     [Open webmail] | |
|  | + add task      [All tasks ->]  |  +----------------------------------------+ |
|  +---------------------------------+                                             |
|  +-- Pipeline by stage (bars) ------+  +-- Price moves this week ---------------+ |
|  +-- Tip of the day (Knowledge) ----+  +-- Needs attention (lists, follow-ups) --+ |
+--------------------------------------------------------------------------------+
```

- **App tiles** come from a registry; a tile shows only if the user is allowed that app. Each tile can carry one small
  number badge (e.g. price lists waiting, tasks due, overdue follow-ups).
- **"Coming soon" tiles** (Accounts, Prospecting) show greyed, **to admins only**, so staff are not confused.
- **This week** tiles are role/app aware. With only Procurement allowed, a user sees procurement numbers only.
- **Widgets with no data yet** show a one-line empty state and the action that fills them (never a blank box).
- **Daily quote**: ~60 short lines in `src/lib/quotes.ts`, picked by day-of-year so everybody sees the same one that day.
  Shown to `sales` and `admin`. Admin can add their own lines later (settings table).
- **Mobile**: tiles 2 per row, widgets stack in one column.
- Widgets load independently (Suspense) so a slow IMAP or query never blocks the tiles.

## 4. App map and what each app contains

| App (key) | Who by default | Pages | Status |
|---|---|---|---|
| **Procurement** `procurement` | admin, sales | existing: Overview, Compare, Paste/Import, Alerts, Price lists, Suppliers, Products | live, moves under `/procurement` |
| **Sales** `sales` | admin, sales | Pipeline (board + list), Companies, Contacts, Quotes, Activity | Phase 5-6 |
| **Tasks** `tasks` | everyone | My tasks, Team tasks (admin), Add task | Phase 3 |
| **Knowledge** `knowledge` | everyone | Hardware guide, Sales playbook, Finding customers in UAE | Phase 4 |
| **Accounts** `accounts` | admin | placeholder; later invoices, payments due, receivables | later |
| **Prospecting** `prospecting` | admin | placeholder; later new-licence feeds, scraped contacts, cold email, website-offer campaigns | later |
| **Admin** `admin` | admin only | existing page + per-user app access | Phase 1 |

Access rule: `admin` sees every app. `sales` gets the default list above unless admin saved an explicit list for that user.

## 5. Existing UI that changes (needed for the portal)

| # | Change | Files |
|---|---|---|
| 1 | **Split the layout.** `(app)/layout.tsx` becomes thin (session check only). A shared `AppHeader` is used by Home and by every app. Each app gets its own `layout.tsx` with its own sidebar. (Header lives inside `SidebarInset` per app, so the fixed sidebar never overlaps a top bar.) | `src/app/(app)/layout.tsx`, new `(app)/(home)/layout.tsx`, `(app)/procurement/layout.tsx` |
| 2 | **Procurement moves under `/procurement/*`**: `/` -> `/procurement`, `/compare`, `/import`, `/alerts`, `/price-lists`, `/suppliers`, `/products/[id]` all get the prefix. Old URLs get redirects in `next.config.ts` so saved links and WhatsApp-shared links keep working. `/api/*` stays where it is. | move folders under `src/app/(app)/procurement/`; `next.config.ts` |
| 3 | **Fix every internal link** to the new prefix: sidebar, global search results, dashboard cards, compare/product/supplier pages, review page, `redirect()` calls. One grep-and-replace pass, then `typecheck`. | `app-sidebar.tsx`, `global-search.tsx`, `api/search/route.ts`, pages |
| 4 | **Sidebar becomes generic**: takes `{ title, icon, groups }` from a per-app nav config; adds a top "All apps" link back home; user name + sign-out move to the header user menu. Procurement's badge queries (`listCounts`, `priceMoves`) move into the procurement layout so Home does not pay for them. | `app-sidebar.tsx` -> `app-sidebar.tsx` (generic) + `src/lib/app-nav.ts` |
| 5 | **Header gets**: brand link to Home, an **Apps** switcher popover (allowed apps only), global search, theme toggle, **user menu** (name, role, sign out). | new `src/components/app-header.tsx`, uses `ui/popover`, `ui/dropdown-menu` |
| 6 | **Global search becomes federated**: results grouped by app (Procurement products now; Companies/Deals/Contacts when Sales exists), only for apps the user may open. | `global-search.tsx`, `api/search/route.ts` |
| 7 | **Branding text**: "Zeronix Procurement" -> "Zeronix" in login card, page `<title>` suffixes, sidebar header ("Zeronix · Procurement" per app). Login copy: "Sign in to Zeronix Portal." | `login-form.tsx`, each page `metadata`, README |
| 8 | **Admin**: add an **Apps** checkbox group per user row in `AdminUsers` ("use role defaults" or a custom list); non-admin redirect goes to `/` not `/compare`. | `admin/admin-ui.tsx`, `admin/actions.ts`, `admin/page.tsx` |
| 9 | **Server-side access checks** on procurement pages *and* server actions/route handlers (today they only call `requireUser`). New `requireApp(key)`. | `src/lib/auth/session.ts`, `*/actions.ts`, `api/export`, `api/import/excel` |
| 10 | **Light visual polish only**: app tile style (card + coloured icon using existing `--series-N` tokens), consistent page padding, empty states. No new theme, no new fonts. | `globals.css` (tokens only), new `app-tile.tsx` |

Not changing: the procurement logic, parser, worker, DB tables, price-list review grid, compare page behaviour.

## 6. Technical design

**App registry** `src/lib/apps.ts` (single source of truth):
```ts
export const APPS = [
  { key: "procurement", label: "Procurement", href: "/procurement", icon: PackageSearch,
    blurb: "Compare supplier prices", defaultFor: ["admin","sales"], status: "live" },
  { key: "sales", ... defaultFor: ["admin","sales"], status: "live" },
  { key: "tasks", ... defaultFor: ["admin","sales"] },
  { key: "knowledge", ... defaultFor: ["admin","sales"] },
  { key: "accounts", ... defaultFor: ["admin"], status: "soon" },
  { key: "prospecting", ... defaultFor: ["admin"], status: "soon" },
  { key: "admin", ... defaultFor: ["admin"] },
] as const;
export function allowedApps(user): AppKey[]   // admin -> all; else user.apps ?? role defaults
```

**Access data**: `users.apps text[] NULL` (NULL = role defaults). `requireApp(key)` in `lib/auth/session.ts` reads the user's
row (`is_active`, `apps`) from the DB each call (one cheap indexed query), so an admin change takes effect immediately without
waiting for the 7-day JWT to expire. It also closes an existing gap: `verifySession` never checks `is_active`, so a
deactivated user's token still works for up to 7 days. No JWT shape change.

**Routing (Next 16, App Router; read `node_modules/next/dist/docs/01-app` route-group and layout docs before coding)**
```
src/app/(app)/
  layout.tsx                 requireUser + providers only
  error.tsx loading.tsx not-found.tsx   (stay)
  (home)/layout.tsx          AppHeader, no sidebar
  (home)/page.tsx            Home at "/"
  procurement/layout.tsx     requireApp("procurement"), SidebarProvider, procurement nav + badges
  procurement/page.tsx       (today's dashboard)   compare/ import/ alerts/ price-lists/ suppliers/ products/
  sales/layout.tsx           requireApp("sales")   pipeline/ companies/ contacts/ quotes/
  tasks/  knowledge/  admin/ accounts/ prospecting/
```
`proxy.ts` stays as the optimistic login gate; per-app checks live in layouts and actions (never only in the proxy).

**New tables** (Drizzle, `npm run db:generate`; each phase adds only what it needs)

| Table | Key columns | Phase |
|---|---|---|
| `users` (+col) | `apps text[]` | 1 |
| `tasks` | title, notes, due_at, priority, status (`open/done`), assigned_to, created_by, related_type + related_id, done_at | 3 |
| `mail_accounts` | user_id, imap_host, imap_user, password_enc (AES-GCM, key derived from `AUTH_SECRET`), last_uid, last_checked_at, last_error | 4 |
| `mail_messages` | user_id, uid, from_name, from_email, subject, snippet (<=200 chars, no body), received_at, seen | 4 |
| `companies` | name, industry, emirate, website, trade_license_no, trn, source, owner_id, notes | 5 |
| `contacts` | company_id, name, job_title, email, phone, whatsapp, is_decision_maker | 5 |
| `deals` | company_id, contact_id, title, stage, source, requirement_text, est_value, currency, expected_close, owner_id, lost_reason, genuine_checks jsonb, stage_changed_at | 5 |
| `deal_items` | deal_id, description, category, qty, product_id?, offer_id?, cost, cost_currency, margin_pct, sell_price | 6 |
| `activities` | type (`call/email/whatsapp/meeting/note/stage`), body, deal_id?, company_id?, contact_id?, user_id, at | 5 |
| `quotes` | number (`ZQ-2026-0001`), deal_id, status (`draft/sent/accepted/rejected/expired`), valid_until, vat_pct, terms, total, sent_at | 6 |
| `quote_items` | quote_id, position, description, qty, unit_price (snapshot of deal_items) | 6 |

**Deal stages** (fixed list in code, shown as board columns): `New enquiry -> Contacted -> Requirement confirmed ->
Sourcing -> Quote sent -> Negotiation -> Won / Lost`. Stage changes write an `activities` row automatically.

**Lead is genuine?** The deal form has a 4-tick checklist (Budget, Decision-maker spoken to, Clear need/spec + quantity,
Timeline/PO date) plus 3 verify ticks (company email domain, trade licence seen, TRN checked). The ticks give a simple
Hot / Warm / Cold label on the card. The Knowledge sales playbook explains each tick. No scoring engine.

**Procurement -> Quote link (the core of the business flow)**
1. On a deal's "Requirement" lines, button **Find price** opens the existing compare search (`/procurement/compare?q=...`) in a
   side sheet.
2. **Use this offer** copies the supplier, cost, currency (converted with the existing `lib/fx.ts` rule) and `offer_id` into the
   line. Sell price = cost x (1 + margin%), margin defaults from a setting.
3. **Create quote** snapshots the lines into `quotes`/`quote_items` with a number and VAT. Output: on-screen printable page
   (print to PDF, no PDF library) and **Copy as WhatsApp text** (same style as `lib/export.ts` quote text).
4. Marking the deal **Won** is the "closing" event; later Accounts reads won deals to raise invoices.

**Email widget (IMAP)**: new job in `src/worker/` (alongside `feeds.ts`) polls each configured mailbox every ~5 minutes using
`imapflow` (+ `mailparser` for the header/snippet only) against Hostinger IMAP (`imap.hostinger.com:993`). Each user sees only
their own mailbox. Home shows the latest 5 with sender, subject, time, unread dot and an **Open webmail** link. It is *not* a
mail client. Later: match sender address to `contacts.email` to log an activity on the deal automatically. Passwords are
encrypted at rest; never logged or sent to the browser. The worker already has an on/off pattern (see `src/worker/index.ts`).

**Knowledge panel content** is files in the repo (`src/content/knowledge/`): typed TS data for the hardware tables, Markdown for
the sales guides, rendered by simple pages with an in-page search box and a "last reviewed" date on each article. No CMS in v1;
an admin editor can come later. Topics:
- *Hardware*: laptops (business lines Dell Latitude/Precision, HP ProBook/EliteBook/ZBook, Lenovo ThinkPad/ThinkBook, Apple
  MacBook), what UAE corporates usually buy (14", Core i5/i7 or Core Ultra / Ryzen PRO, 16 GB, 512 GB SSD, Windows 11 Pro,
  3-year onsite warranty, vPro/TPM, docking), workstations (Dell Precision, HP Z, Lenovo ThinkStation; Xeon W / Threadripper PRO /
  Core i9; RTX professional GPUs; ECC RAM; ISV certification), servers (PowerEdge, ProLiant, ThinkSystem, Supermicro; Xeon Scalable /
  EPYC; tower vs 1U/2U; RAID, NVMe, redundant PSU, iDRAC/iLO), a processor cheat-sheet (Intel Core / Core Ultra / Xeon, AMD Ryzen / EPYC,
  Apple M-series, Snapdragon X). Specs change fast, so every page carries a review date and gets re-checked before release.
- *Sales playbook*: dealing with corporates (decision-maker vs buyer, RFQ/LPO flow, vendor registration, payment terms), how to talk
  (opening lines, discovery questions, objections: price, "we already have a vendor", "send an email"), **how to tell a lead is
  genuine on the first call** (red-flag list + the checklist above), the sales mindset, daily routine.
- *Finding customers in UAE*: free-zone new-licence announcements (e.g. Meydan Free Zone's announcements page), DDA/Chamber
  directories, tenders and supplier-registration portals, exhibitions, LinkedIn, referrals. This page also records the idea for the
  future Prospecting app.

**Prospecting app (later, not built now)**: a scheduled fetcher for public new-licence pages (Meydan etc.) into a `prospects` table
with company, licence date, activity, and any *business* email/phone published on the page; admin reviews, then converts a prospect to a
Company/Deal or adds it to a campaign (cold email, "we also build websites/software"). Before building: check each site's terms and
robots rules, keep to business contact details, and include an unsubscribe line plus a suppression list (UAE PDPL and TDRA
anti-spam rules apply to cold email). Sending goes through the Hostinger SMTP account at a throttled rate.

## 7. Phases (order of work)

| Phase | Outcome | Why this order |
|---|---|---|
| **0. Housekeeping** | Commit or stash the current uncommitted changes (`admin/actions.ts`, `llm/*`, `worker/*`) so the restructure diff is clean. Create branch `portal`. | Phase 1 touches `admin/` and moves most files. |
| **1. Portal shell** | App registry, `users.apps`, `requireApp`, `AppHeader` + apps switcher + user menu, procurement moved to `/procurement` with redirects and links fixed, generic sidebar, Admin app toggles, branding text. Procurement behaves exactly as before. | Everything else hangs on this. |
| **2. Home screen** | Tiles, greeting, daily quote, "this week" tiles (procurement live; others show once data exists), widget slots with empty states, mobile layout. | You asked to start here; works before CRM exists. |
| **3. Tasks** | Tasks app + "My tasks today" widget, add-task from anywhere, overdue highlight, admin can assign to others. | Home needs tasks; Sales activity uses them. |
| **4. Knowledge** | Hardware, Sales playbook, UAE customers pages with search. | Pure content, no dependencies. |
| **5. Email widget** | IMAP job + `mail_accounts` setup screen under the user menu + latest-emails widget. | Needs worker pattern and secret handling. |
| **5b. Mail app** | Read the inbox, compose / reply / forward inside the portal, per-user signature with the Zeronix logo (decided with the owner: light client, no folder management; webmail stays for the rest). Mail is attached by CID so the logo shows outside the company network. | Asked for after the email widget worked. Linking to deals comes with Sales. |
| **6. Sales basic** | Companies, contacts, deals with board + list, activities, genuine-lead checklist, follow-up tasks, home pipeline widget. | Core CRM. |
| **7. Quotes** | Deal lines, Find price from procurement, margin, quote number, printable page, WhatsApp text, Won/Lost. | Connects procurement to closing. |
| **8-12. Go-live and order-to-cash** | See [GO-LIVE-PLAN.md](GO-LIVE-PLAN.md): go-live checklist, sales orders, delivery notes, tax invoices, credit notes, payments, statements. | The team starts using quotes; money follows. |
| **14. Team chat** | Chat widget on every page: direct messages, groups, deal/project threads, @mention cards from the timeline and tasks, card actions, presence and alerts. Live over SSE + Postgres LISTEN/NOTIFY. Plan: `~/.claude/plans/i-ineed-to-add-eager-falcon.md`. | The team asked to stop moving deal talk to WhatsApp. |
| **Later** | Prospecting (licence feeds + cold email), email-to-deal matching, admin-editable knowledge. | After 1-7 are in daily use. |

## 8. Verification

- `npm run typecheck`, `npm run lint`, `npm test` after each phase (no Ollama needed; do **not** start it, per your note on RAM).
- Add Vitest tests for `allowedApps()` (admin, sales default, sales custom list, inactive) and for the redirect map.
- Manual (dev server `npm run dev`, port 3100): log in as admin and as a sales user; confirm tiles differ; untick Procurement for the
  sales user in Admin and confirm the tile disappears, `/procurement/compare` returns not-found, and the export/import endpoints reject.
- Check old URLs (`/compare?q=...`, `/suppliers/3`, `/import/12`) redirect to the new ones with query strings intact.
- Mobile width (375 px): tiles 2-up, no horizontal scroll, sidebar opens as a sheet.
- Phase 5: connect a test mailbox, confirm the widget shows only that user's mail and that the stored password is not readable in the DB.
- Phase 7: create a deal -> add a line -> Find price -> Use offer -> create quote -> printed page totals match; copy text pastes cleanly in WhatsApp.

## 9. Risks and notes

- Moving procurement routes touches many files, but it is a mechanical rename guarded by `typecheck` and the redirect map.
- IMAP credentials are the most sensitive new data; use an app-specific mailbox password and encrypt at rest.
- Knowledge content must be reviewed by the team; hardware names and specs go out of date.
- Scraping and cold email are deferred on purpose, to be done with legal basics in place.




---

Task list and progress: see [TASKS.md](TASKS.md). Tasks are ticked off there as each one is finished.
