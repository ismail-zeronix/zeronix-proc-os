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
- [x] 6b.7 UI pass for the other apps: Procurement (6c), then Tasks, Knowledge, Mail, Admin and My account (7c) [2026-10-21]
- [ ] 6b.8 Drag and drop on the board

## Phase 6c: Procurement UI pass (same rules as Sales, see UI-GUIDELINES.md)
Layout only: no change to parsing, matching, saving, URL filters, search/export APIs or access checks.
- [ ] 6c.1 Shared AppShell (collapsed sidebar, tight padding) for Sales and Procurement
- [x] 6c.2 Compare: one toolbar (search, sort, Filters popover with active chips, toggles, export), one table for all products with a sticky header and the offers under each product, scrolls inside its panel [2026-10-21]
- [x] 6c.3 Overview: KPI tiles with change vs last week, tabs for lists waiting / recently saved / quiet suppliers, price moves tabs, charts (offers by supplier, offers added per week) [2026-10-21]
- [x] 6c.4 Add price list: compact toolbar, how-it-works popover instead of three cards, icon toggle for Paste / Excel, form fills the screen [2026-10-21]
- [x] 6c.5 Review page: one-row header, Save always visible, grid fills the screen [2026-10-21]
- [x] 6c.6 Price lists, Alerts, Suppliers: one toolbar row each, dense tables [2026-10-21]
- [x] 6c.7 Supplier page (tabs: offers, price lists, live feed) and Product page (tabs: current prices, history) [2026-10-21]
- [x] 6c.8 Checked in a real browser at laptop and phone width, light and dark, and compared with the screens before [2026-10-21]

## Phase 7: Quotes
- [x] 7.1 tables `deal_items`, `quotes`, `quote_items` (migration 0011) [2026-10-21]
- [x] 7.2 Quote tab on a deal: lines with cost, margin and price, saved as you leave a box, totals with VAT and profit [2026-10-21]
- [x] 7.3 Find price dialog (searches Procurement prices); Add uses the offer's cost read on the server plus the default margin [2026-10-21]
- [x] 7.4 Make quote: numbered ZQ-year-0001 (safe when two people save at once), VAT, valid until, terms, lines copied [2026-10-21]
- [x] 7.5 Quote page, clean print / PDF page, Copy as WhatsApp text, Email link [2026-10-21]
- [x] 7.6 Quote status (Sent moves the deal to Quote sent, Accepted marks it Won, Rejected leaves it), Quotes list, Ctrl K finds quotes, Admin defaults [2026-10-21]

## Phase 7b: Punch in / out (work hours, not a full attendance system)
- [x] 7b.1 tables `attendance_punches`, `attendance_absences` (migration 0012); rules in src/lib/attendance.ts [2026-10-21]
- [x] 7b.2 Punch in / out switch next to the welcome message; late punch-in or leaving inside work hours asks for a reason (fixed list or typed) [2026-10-21]
- [x] 7b.3 Until punched in, every click or key press shows an error toast (home link, theme, user menu and sign out still work) [2026-10-21]
- [x] 7b.4 Monthly attendance heatmap on My account and on the new admin user page (/admin/users/[id]); click a day to record a medical or other absence [2026-10-21]
- [x] 7b.5 Admin "Work hours" card: 9:30 AM to 9:30 PM, break 2:30 to 4:30 PM, Sunday off by default [2026-10-21]
- [x] 7b.6 Live UAE clock in the header (dot = punch status); click it to punch in / out from any page, and the gate's toast opens it [2026-10-21]
- [x] 7b.7 Attendance redrawn: small calendar cells (filled = at work, outlined = away), month numbers and an exceptions list with reasons; team heatmap on the Admin overview [2026-10-21]
- [ ] 7b.8 Check in a real browser (switch, reason dialog, blocked clicks, calendar tooltips) at laptop and phone width, light and dark

## Phase 7c: UI pass for the remaining apps (UI-GUIDELINES.md)
- [x] 7c.1 Admin is a sidebar app: Overview (team today + attendance heatmap), Users (dense table, + dialog), AI & feeds, Settings (tabs: work hours, quotes, AI & comparison, branding) [2026-10-21]
- [x] 7c.2 User page: one-row header, stat strip, Attendance / Details tabs [2026-10-21]
- [x] 7c.3 My account: one-row header, Attendance / Mailbox / Email signature tabs (open tab kept in ?tab=) [2026-10-21]
- [x] 7c.4 Tasks: one grouped list, toolbar with Mine / Everyone and person avatars, + to add, notes on one line, done tasks folded [2026-10-21]
- [x] 7c.5 Knowledge: toolbar with search, sections side by side, article page with "more in this section" [2026-10-21]
- [x] 7c.6 Mail: sender avatars, smaller titles (layout was already two-pane) [2026-10-21]
- [x] 7c.7 Checked with headless Edge screenshots at 1440 px and 390 px, light and dark; no page scrolls sideways on a phone [2026-10-21]

## Phase 8: Go-live (see GO-LIVE-PLAN.md part A)
Owner decisions (2026-10-21): accounting stays in Zoho for now, invoice numbers continue from Zoho (owner gives the next number); one delivery and one invoice per order; payments in cash or bank transfer, full or part; credit terms 7 / 15 / 30 days with overdue; a central Files app for documents; office network only; customer list imported later.
- [x] 8.1 Docker web rebuilt with everything (migrations 0011-0015); database port bound to this machine only (was open to the network with the default password) [2026-10-21]
- [~] 8.2 Nightly backups on (database + uploaded files, 14 days in ./backups), one restore tested into a throwaway database. **Still open: copy backups off this machine**
- [ ] 8.3 Change the default admin password (left for the owner so nobody is locked out); AUTH_SECRET is long and random (checked)
- [x] 8.4 Users change their own password (My account → Password) [2026-10-21]
- [x] 8.5 Login lockout after 5 wrong passwords for 15 minutes, failed logins logged, admin reset unlocks [2026-10-21]
- [x] 8.6 Access: office network only, http://<server>:3200 [2026-10-21]
- [~] 8.7 Settings → Documents built (our TRN, bank, IBAN, invoice series, default terms). **Owner to fill in; an invoice cannot be issued without our TRN**
- [x] 8.8 Full check: typecheck, lint, 186 tests, build (scratch _*.ts files are kept out of Docker by .dockerignore) [2026-10-21]
- [ ] 8.9 Import companies and contacts from Excel/CSV (owner will send the list later)
- [x] 8.10 End-to-end test of quote → order → delivery → invoice → payment in a real browser (headless Edge) and in tests [2026-10-21]
- [x] 8.11 Punch-in rule enforced on the server (every app action and file upload) [2026-10-21]
- [x] 8.12 Knowledge → Using the portal: daily routine, quote to money [2026-10-21]
- [x] 8.13 Error log: every server error saved with page and user (instrumentation onRequestError), Admin › Errors shows the last 100 [2026-10-25]

## Phase 9: Sales orders and delivery (one delivery per order)
- [x] 9.1 Tables sales_orders, sales_order_items (migration 0014) [2026-10-21]
- [x] 9.2 Convert to order on the quote (PO number/date, credit terms, delivery address); quote Accepted, deal Won; Orders list (To deliver / To invoice / Invoiced) and order page [2026-10-21]
- [x] 9.3 Mark delivered gives the delivery note number (ZDN-year-0001); delivery note print with signature boxes; proforma invoice print; cancel order (before invoicing) [2026-10-21]
- [x] 9.4 Customer PO and signed delivery note uploaded on the order (Files tab) [2026-10-21]
- [ ] 9.5 Buying checklist per line and "To buy" list (not asked yet)
- [ ] 9.6 Partial deliveries (not needed for now)

## Phase 10: Tax invoices and credit notes
- [x] 10.1 Tables invoices, invoice_items, credit_notes; invoice numbers from the Admin series (prefix + next number + digits), no gaps, safe when issued at the same moment [2026-10-21]
- [x] 10.2 Make invoice (Accounts) from a delivered order, locked once issued; UAE tax invoice print with both TRNs, date of supply, VAT per line, amount in words, bank details [2026-10-21]
- [x] 10.3 Invoices list (Not paid / Overdue / Paid / Cancelled) and invoice page [2026-10-21]
- [x] 10.4 Cancel invoice with a full credit note (ZCN-year-0001); the order can be invoiced again [2026-10-21]
- [ ] 10.5 Email the invoice as a PDF from the portal (today: Print → Save as PDF, then attach)

## Phase 11: Payments and receivables
- [x] 11.1 Payments table, receipt voucher (ZRV-year-0001), cash or bank transfer, full or part; bank transfers need a reference [2026-10-21]
- [x] 11.2 Void a payment with a reason (kept on record) [2026-10-21]
- [x] 11.3 Accounts overview: owed, overdue, due in 7 days, collected this month, ageing chart, open invoices most-overdue first [2026-10-21]
- [x] 11.4 Customers with balances; statement of account for a period, print/PDF [2026-10-21]
- [x] 11.5 Collection task for the deal owner on the due date, closed automatically when paid [2026-10-21]
- [ ] 11.6 Post-dated cheques (not taken for now)

## Phase 12: Alongside 9-11
- [x] 12.1 Accounts app: issue invoices and record payments only for admins and people given Accounts in Admin → Users [2026-10-21]
- [~] 12.2 Every order, delivery, invoice, payment, void and cancellation is written to the deal timeline with who and when; a separate audit log is still open
- [x] 12.3 Excel (CSV) export of every report for the accountant (Accounts › Reports) [2026-10-25]
- [x] 12.4 Document settings: invoice prefix, next number, digits, default terms, bank [2026-10-21]
- [ ] 12.5 Notifications
- [x] 12.6 Files app: shared documents with folders, search, upload up to 20 MB (PDF, images, Office, CSV, zip, email), linked to orders and invoices, uploader or admin can delete; stored on a Docker volume and in the nightly backup [2026-10-21]

## Phase 13: Projects app (plan: ~/.claude/plans/lets-brainnstrom-new-app-shimmering-cascade.md)
- [x] 13.1 Foundation: deals have a kind (Product / Project) chosen on the new-deal form or the deal Details tab; a project deal opens a project numbered ZPJ-year-0001 with a type (CCTV, networking, server room, access control, AV, office IT, software, other) [2026-10-23]
- [x] 13.2 Projects app: overview dashboard (in progress, leads, quoted, won and completed this month, by phase, by type, per month, needs attention), list grouped by phase with a board view, project page with site & plan, tasks, quotes & orders, timeline; Sales pipeline gets a Products / Projects filter [2026-10-23]
- [x] 13.3 BOQ: projects are priced in sections (ready-made per project type, editable) with kind of line (material, labour, service, lump sum), unit, optional extras, section margin, cost / margin per section; Make quote from the BOQ copies sections and units (ZQ series), the quote print and WhatsApp text are grouped by section; on a project deal Sales shows a BOQ card instead of the product line editor [2026-10-23]
- [x] 13.4 Checklist per project type: every new project gets its type's tasks in three groups (Survey & proposal, Work on site, Handover); survey dates count from opening, work and handover dates follow the start date (hand-picked dates stay); the whole project team can tick, add, reorder and reassign; required tasks must be done before "Completed" (an admin can override, written to the timeline); tasks show in Tasks and on Home linked to the project; Admin > Settings > Projects edits types, default BOQ sections and starting checklists [2026-10-23]
- [x] 13.5 Proposal editor (Projects > project > Proposal): blocks for cover, heading, text (bold, lists, links, alignment, highlighted note), table, price from the BOQ (every item or section totals, optional extras), payment schedule (shares of the total with VAT), timeline, terms (standard texts + a shared library), signatures, divider, page break; outline on the left with drag to reorder; "+" between blocks or "/" in an empty text to add; autosave a second after each change, refusing to overwrite a newer version; start from the standard proposal or a saved template, save as template [2026-10-23]
- [ ] 13.5b Image block (cover photo, site photos) through the Files app
- [x] 13.6 Proposal print / PDF / email in Zeronix's own layout (dark full-page cover, quotation header, numbered sections, bordered quotation table with totals inside, bank details, signature and stamp; PDF with running header and page numbers after the cover); Make quote freezes the proposal with the quote (the quote print, PDF, email and accept-to-order use the frozen copy); project quotes valid 14 days with project terms; Admin > Settings > Documents: email, phones, trade licence, white logo, signature, stamp [2026-10-24]
- [ ] 13.7 Project procurement (buy list from the BOQ material lines, Find price), expenses with receipts, budgets, profit
- [ ] 13.8 Payment milestones: PI per milestone, advance receipts on the order
- [ ] 13.9 Completion report, Zeronix completion certificate (ZPC), signature and stamp images in Admin, one final invoice with advances applied (one line per BOQ section)
- [ ] 13.10 Home tile badge and widget, Ctrl K search, company Projects tab

## Phase 14: Team chat (plan: ~/.claude/plans/i-ineed-to-add-eager-falcon.md)
- [x] 14.1 Foundation: chat tables (conversations, members with read position, messages, reactions, chat settings); live delivery over Server-Sent Events with Postgres LISTEN/NOTIFY (no extra service; `/api/chat/stream`); chat button bottom-right on every page once punched in (Alt+C, Esc), opening a panel upwards (full screen on a phone); direct messages with a people picker (online first), unread counts on the button and per conversation, "Seen", online dots, unsent drafts and the open conversation kept per browser; chat is for every active user (not an app toggle) [2026-10-24]
- [x] 14.2 Channels (public or private, join, add/remove people, rename, topic, leave, archive; the owner or an admin manages; owner leaving hands over), deal threads (Chat tab on the deal and the project, the deal's team is in it and follows assignee changes, admins / "All data" users can open any, gone with the deal), quoted replies, thread replies, emoji reactions, edit and delete (admins can delete anyone's), "typing…", who has read up to where in channels; widget tabs Chats / Deal threads [2026-10-24]
- [x] 14.3 @mentions and record cards: `@` people picker and `#` record picker (deals, quotes, orders, invoices, companies, products) in chat, the deal timeline, company notes and task notes; mentions show as chips; each person mentioned gets a live card in the widget Activity tab (deal, company, task, or the chat message), in channels and deal threads only for members and never for a DM; a locked card for people who may not see the record, a warning before saving (admins can add them to the deal); `#` records show as cards under the message; editing task notes tells only people newly mentioned [2026-10-24]
- [x] 14.4 Card buttons (Mark done / Reopen on tasks, Mark sent / Accepted / Rejected on quotes, Mark delivered today on orders, Follow-up task on deals; the record's own rules apply, a line is written in the conversation and every open card refreshes); status online / away (tab in the background 5 min) / do not disturb for 1 h, 4 h, until tomorrow 8:00 or until turned off, shown live as coloured dots; chime and desktop notifications (one tab alerts, not while reading, muted or on do not disturb); mute a conversation for 1 h, 8 h or for good; full `/chat` page (also in Ctrl K and the widget pop-out button) with message search across your conversations. No home tile: chat is not a per-user app, and the chat button shows the unread count on every page [2026-10-25]
- [ ] 14.5 Polish: keyboard shortcuts, empty states, screenshots
- [x] 14.6 Website chat (branch `dev`): widget for www.zeronix.ae in `widget/` (one plain script, Shadow DOM, served at `/widget/zeronix-chat.js`, demo at `/widget/demo.html`); a chat starts when a visitor lands, every punched-in CRM user's portal rings (own trill, repeats every 3 s, blinking tab title, desktop notice) until someone accepts or the visitor leaves; lead form (name, email, phone, company, question) before chatting; visitor sees who in sales is online, the agent's name once accepted, typing, ended; Website tab in the chat widget and /chat (Waiting / Live / Ended 7 days, Accept, Take over, End, contact strip); admin picks "ring for every visitor" or "only after the form"; public endpoints `/api/widget/*` limited to WEBCHAT_ORIGINS and rate limited [2026-10-30]
- [ ] 14.7 Website chat next: add the script to zeronix.ae and test live; "Create lead" button that turns a chat into a CRM deal; email the transcript to the visitor; office-hours message

## Phase 15: CRM + Accounts restructure (plan: ~/.claude/plans/i-want-to-change-fluttering-crab.md)
Owner decisions (2026-10-25): Sales renamed CRM; quotes, orders, customers move to Accounts; sales staff quote at an Accounts "sales" level; the portal replaces Zoho Books for bills, payments and reports; no purchase orders.
- [x] 15.1 CRM app (/crm): Overview, Deals, Companies, Contacts; deal Quotes tab read only; stages Qualified / Pricing; old /sales links redirect [2026-10-25]
- [x] 15.2 Accounts levels (sales / finance) in Admin › Users; quote builder, quotes, orders, customers in Accounts; To invoice merged into Orders [2026-10-25]
- [x] 15.3 Purchases: supplier bills, expenses, payments made (ZBL / ZPV), supplier billing details, real cost and profit on orders [2026-10-25]
- [x] 15.4 Reports: P&L, VAT, receivables, payables, sales, profit per order, cash; CSV export [2026-10-25]
- [x] 15.5 Opening balances from Zoho (customer invoices and supplier bills) [2026-10-25]
- [x] 15.6 Sales app split from Accounts: CRM = leads and deals, Sales = customers, quotes, orders, Accounts = invoices, payments, purchases, reports (the Accounts levels are gone) [2026-10-25]
- [x] 15.7 Mark as won (existing company, winning quote or agreed terms, missing details become a task); TRN and address checks on orders and invoices; deal header and linked timeline [2026-10-25]
- [x] 15.8 Standalone quotes (no deal needed): quotes and orders may have no CRM deal; quote carries customer, contact, salesperson, payment terms, notes; one two-column quote page for new and edit; CRM Leads page with Qualify [2026-10-26]
- [ ] 15.9 Owner: enter opening balances at the cut-over date; give Accounts only to the accounts person

## Later
- [ ] L.2 Prospecting app (new-licence feeds, review, convert to deal)
- [ ] L.3 Cold email campaigns with unsubscribe + suppression list
- [ ] L.4 Link emails to contacts/deals automatically and log them as activities; create a task from an email
- [ ] L.5 Admin-editable knowledge and quotes
