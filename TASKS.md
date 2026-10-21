# Zeronix Portal: Tasks

Status key: [ ] todo, [~] in progress, [x] done. Update this file when a task is finished (date in brackets).
Plan: see PLATFORM-PLAN.md.

## Phase 0: Housekeeping
- [x] 0.1 Commit current uncommitted changes (admin/actions, llm, worker) [2026-10-21]
- [x] 0.2 Create branch `portal` [2026-10-21]

## Phase 1: Portal shell
- [x] 1.1 Add `src/lib/apps.ts` registry + `allowedApps()` (+ unit tests) [2026-10-21]
- [x] 1.2 Add `users.apps text[]` column + migration [2026-10-21]
- [x] 1.3 Add `requireApp(key)` in `lib/auth/session.ts` (DB check, also rejects inactive users) [2026-10-21]
- [x] 1.4 Move procurement pages under `src/app/(app)/procurement/` and add `procurement/layout.tsx` [2026-10-21]
- [x] 1.5 Add redirects for old URLs in `next.config.ts` (keep query strings) [2026-10-21]
- [x] 1.6 Fix internal links, `redirect()` calls, global search and `/api/search` result URLs [2026-10-21]
- [x] 1.7 Generic sidebar from per-app nav config (`lib/app-nav.ts`), "All apps" link on top [2026-10-21]
- [x] 1.8 `AppHeader`: brand, apps switcher, search, theme toggle, user menu (sign out) [2026-10-21]
- [x] 1.9 Thin `(app)/layout.tsx`; `(home)` group layout without sidebar [2026-10-21]
- [x] 1.10 Admin: per-user Apps checkboxes + save action; non-admin redirect to `/` [2026-10-21]
- [x] 1.11 `requireApp("procurement")` on procurement pages, server actions, `api/export`, `api/import/excel` [2026-10-21]
- [x] 1.12 Branding text (login, metadata titles, sidebar title) and README update [2026-10-21]
- [x] 1.13 Verify: typecheck, lint, tests, manual role check, old-URL redirects [2026-10-21]

## Phase 2: Home screen
- [x] 2.1 `app-tile.tsx` + tiles grid from registry (allowed apps only, soon tiles admin-only) [2026-10-21]
- [x] 2.2 Greeting + date + daily quote (`lib/quotes.ts`, ~60 lines, day-of-year pick) [2026-10-21]
- [x] 2.3 "This week" tiles: procurement numbers live; sales numbers when Sales exists (procurement done; sales numbers join in Phase 6) [2026-10-21]
- [x] 2.4 Widget slots with empty states: My tasks, Latest emails, Pipeline, Price moves, Needs attention (tasks/email/pipeline/tip shown as admin-only placeholders until built) [2026-10-21]
- [x] 2.5 Tile badges (lists to review, tasks due) (procurement badge done; tasks badge in 3.4) [2026-10-21]
- [x] 2.6 Suspense per widget; mobile layout check (Suspense done; check phone width in a browser) [2026-10-21]
- [x] 2.7 Tip of the day slot (wired to Knowledge in Phase 4) (placeholder card; real tip in 4.6) [2026-10-21]

## Phase 3: Tasks
- [x] 3.1 `tasks` table + migration [2026-10-21]
- [x] 3.2 Tasks app: My tasks, Team tasks (admin), add/edit/complete, assign to user [2026-10-21]
- [x] 3.3 Quick "Add task" in header and from deal/company pages (header shortcut done; deal/company buttons in Phase 6) [2026-10-21]
- [x] 3.4 Home "My tasks today" widget + overdue highlight + tile badge [2026-10-21]

## Phase 4: Knowledge
- [x] 4.1 Knowledge layout + index + search box [2026-10-21]
- [x] 4.2 Hardware: laptops, corporate preferences, workstations, servers, processor cheat-sheet [2026-10-21]
- [x] 4.3 Sales playbook: corporates, how to talk, objections, genuine-lead check, mindset [2026-10-21]
- [x] 4.4 Finding customers in UAE (incl. Meydan announcements, future Prospecting note) [2026-10-21]
- [~] 4.5 "Last reviewed" dates + team review of content (dates are set; content is drafted by Claude and still needs the team's review)
- [x] 4.6 Tip of the day on Home [2026-10-21]

## Phase 5: Email widget
- [x] 5.1 `mail_accounts` / `mail_messages` tables + AES-GCM helper [2026-10-21]
- [x] 5.2 "Connect mailbox" screen (user menu > My account) with test connection [2026-10-21]
- [x] 5.3 Worker job: IMAP poll every ~5 min (sender, subject, date and read flag only; no message text kept) [2026-10-21]
- [x] 5.4 Home "Latest emails" widget + Open webmail link [2026-10-21]
- [ ] 5.5 Try it against a real mailbox (code is tested up to the mail server, not against a live one)

## Phase 5b: Mail app (read, compose, signatures)
Decided with the owner: light client, no folder management. Inbox list + reading pane, compose / reply / reply-all / forward, per-user signature with the Zeronix logo. Webmail stays for rules, spam and searching other folders.
- [x] 5b.1 Branding profile in Admin (logo upload, company, address, website, layout, colour, confidentiality line) + users get job title / phone / mobile [2026-10-21]
- [x] 5b.2 Signature generator (email-safe HTML + plain text, 4 layouts) with live preview in Admin and on My account [2026-10-21]
- [x] 5b.3 `mail` app in the registry (tile with unread badge) and Mail layout (list + reading pane, mobile friendly) [2026-10-21]
- [x] 5b.4 Live inbox list over IMAP (newest 50, older page), unread state [2026-10-21]
- [x] 5b.5 Read a message: HTML sanitised and shown in a locked iframe, remote images off until "Load images", inline images, mark as read [2026-10-21]
- [x] 5b.6 Attachment download (own mailbox only, size limit) [2026-10-21]
- [x] 5b.7 Compose, reply, reply-all, forward over SMTP, signature added, logo attached inline (CID) [2026-10-21]
- [x] 5b.8 Copy saved to the Sent folder; send log and daily send limit per user [2026-10-21]
- [x] 5b.9 Home "Latest emails" rows open inside the portal; webmail link kept as fallback [2026-10-21]
- [ ] 5b.10 Try with a real mailbox (send to yourself, reply, forward, attachment both ways, check the Sent folder and the logo in Gmail/Outlook). Everything is tested up to the mail server, not against a live one

## Phase 6: Sales basic
Design: one record per opportunity (a lead is a deal at stage "New enquiry"). Everyone with the Sales app sees all companies, contacts and deals (small team, no duplicates), with "Mine" as the default filter. Values are in AED. Stages: New enquiry, Contacted, Requirement confirmed, Sourcing, Quote sent, Negotiation, Won, Lost. Stage changes use a menu on the card (no drag and drop yet).
- [x] 6.1 Tables: companies, contacts, deals, activities (+ closed_at) and migration [2026-10-21]
- [x] 6.2 Sales app live: layout, sidebar (Pipeline, Companies, Contacts), access checks, domain rules (stages, sources, Hot/Warm/Cold) with unit tests [2026-10-21]
- [x] 6.3 Companies and contacts: list + search, add/edit, company page, duplicate warning [2026-10-21]
- [x] 6.4 New enquiry quick form: company, contact, requirement, source in one screen; creates the deal and a first follow-up task [2026-10-21]
- [x] 6.5 Pipeline: board by stage + list view, Mine / Everyone filter, search, move stage menu, "Lost" asks for a reason [2026-10-21]
- [x] 6.6 Deal page: details, requirement, genuine-lead checklist with Hot/Warm/Cold, activity timeline + log a call/WhatsApp/email/meeting/note, follow-up tasks linked to the deal [2026-10-21]
- [x] 6.7 Write email from a deal or contact (Mail opens pre-filled) and the sent email is logged on the deal timeline [2026-10-21]
- [x] 6.8 Home: sales "this week" numbers, pipeline widget, deals needing attention, Sales tile badge [2026-10-21]
- [x] 6.9 Search (Ctrl K) finds companies, contacts and deals [2026-10-21]
- [x] 6.10 Tests: domain rules, and access checks over HTTP (a user without Sales is blocked on pages and APIs) [2026-10-21]

## Phase 6b: Sales UI pass (owner review, see UI-GUIDELINES.md)
- [x] 6b.1 Pipeline: one compact toolbar, list by default, icon toggle for list / board, no search box, "+" on every board column opens the enquiry dialog at that stage [2026-10-21]
- [x] 6b.2 Several people per deal: avatars (DiceBear) stacked in list, board and deal page, assign popover, avatar picker in the enquiry form; "Mine" means assigned to me [2026-10-21]
- [x] 6b.3 Sidebar collapsed by default (choice remembered), "All apps" row removed from every app [2026-10-21]
- [x] 6b.4 Sales Overview dashboard (Recharts): KPI tiles with change vs previous period, pipeline by stage, lead quality, won by owner, new vs won trend, sources / lost reasons, needs-attention tabs; 30d / 90d / 12m and Team / Mine [2026-10-21]
- [x] 6b.5 Compact deal page (tabs: timeline, requirement, lead check, details), company page (tabs), companies and contacts lists, phone layout for the pipeline list [2026-10-21]
- [x] 6b.6 Screens checked in a real browser (headless Edge) at laptop and phone width, light and dark [2026-10-21]
- [ ] 6b.7 UI pass for the other apps: Procurement, Tasks, Knowledge, Mail, Admin, Account (apply UI-GUIDELINES.md)
- [ ] 6b.8 Drag and drop on the board

## Phase 7: Quotes
- [ ] 7.1 `deal_items`, `quotes`, `quote_items` tables
- [ ] 7.2 Requirement lines on a deal
- [ ] 7.3 Find price (compare in side sheet) + Use this offer + margin %
- [ ] 7.4 Create quote: numbering, VAT, validity, terms
- [ ] 7.5 Printable quote page + Copy as WhatsApp text
- [ ] 7.6 Quote status + Won/Lost closing flow

## Later
- [ ] L.1 Accounts app (invoices, receivables)
- [ ] L.2 Prospecting app (new-licence feeds, review, convert to deal)
- [ ] L.3 Cold email campaigns with unsubscribe + suppression list
- [ ] L.4 Link emails to contacts/deals automatically and log them as activities; create a task from an email
- [ ] L.5 Admin-editable knowledge and quotes
