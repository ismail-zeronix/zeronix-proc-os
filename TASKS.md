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
- [ ] 2.2 Greeting + date + daily quote (`lib/quotes.ts`, ~60 lines, day-of-year pick)
- [ ] 2.3 "This week" tiles: procurement numbers live; sales numbers when Sales exists
- [ ] 2.4 Widget slots with empty states: My tasks, Latest emails, Pipeline, Price moves, Needs attention
- [ ] 2.5 Tile badges (lists to review, tasks due)
- [ ] 2.6 Suspense per widget; mobile layout check
- [ ] 2.7 Tip of the day slot (wired to Knowledge in Phase 4)

## Phase 3: Tasks
- [ ] 3.1 `tasks` table + migration
- [ ] 3.2 Tasks app: My tasks, Team tasks (admin), add/edit/complete, assign to user
- [ ] 3.3 Quick "Add task" in header and from deal/company pages
- [ ] 3.4 Home "My tasks today" widget + overdue highlight + tile badge

## Phase 4: Knowledge
- [ ] 4.1 Knowledge layout + index + search box
- [ ] 4.2 Hardware: laptops, corporate preferences, workstations, servers, processor cheat-sheet
- [ ] 4.3 Sales playbook: corporates, how to talk, objections, genuine-lead check, mindset
- [ ] 4.4 Finding customers in UAE (incl. Meydan announcements, future Prospecting note)
- [ ] 4.5 "Last reviewed" dates + team review of content
- [ ] 4.6 Tip of the day on Home

## Phase 5: Email widget
- [ ] 5.1 `mail_accounts` / `mail_messages` tables + AES-GCM helper
- [ ] 5.2 "Connect mailbox" screen (user menu) with test connection
- [ ] 5.3 Worker job: IMAP poll every ~5 min (headers + snippet only)
- [ ] 5.4 Home "Latest emails" widget + Open webmail link

## Phase 6: Sales basic
- [ ] 6.1 Tables: companies, contacts, deals, activities + migration
- [ ] 6.2 Companies and contacts pages
- [ ] 6.3 Deals: board + list, stage change, activity log, lost reason
- [ ] 6.4 Genuine-lead checklist + Hot/Warm/Cold label
- [ ] 6.5 Follow-up task from a deal; overdue follow-ups on Home
- [ ] 6.6 Home pipeline widget and "this week" sales numbers
- [ ] 6.7 Federated global search: companies, contacts, deals

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
- [ ] L.4 Match incoming email to contacts/deals automatically
- [ ] L.5 Admin-editable knowledge and quotes
