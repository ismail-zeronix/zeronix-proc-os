# Zeronix Portal

A small company portal. The home screen (`/`) shows one tile per app; each app has its own sidebar. Plan: [PLATFORM-PLAN.md](PLATFORM-PLAN.md), progress: [TASKS.md](TASKS.md).

## Apps and access

Apps are listed in `src/lib/apps.ts` (add an app = one row there + a folder under `src/app/(app)/`). Roles are `admin` and `sales`: admins see every app; for a sales user an admin can pick the apps on **Admin > Users > Apps**, or leave "Use role defaults". Access is checked on the server for pages, server actions and API routes (`requireApp` / `assertApp` / `hasApp` in `src/lib/auth/session.ts`), against the database, so changes and deactivation apply immediately.

## Procurement

Paste supplier WhatsApp price lists, let a **local AI model** turn them into structured rows, review, and compare prices across suppliers.

- **Overview** (`/procurement`): what needs you today (lists to review, failed, being read), suppliers that went quiet, and this week's price moves.
- **Add a price list** (`/procurement/import`): two ways in. **Excel price list** for distributors (see below), and **Paste WhatsApp text** for everyone else: paste the message as-is (emojis, `*bold*`, `@2850/-`), or upload / drop a WhatsApp **chat export** (`.txt`) and pick the message that is the price list. The supplier is auto-detected from signatures like `Supplier : Aman Star IT DXB` (or the chat sender), and the received date from the chat. `[10:32, 19/10/2026] Name:` prefixes from copy-paste are stripped.
- **Review** (`/procurement/import/[id]`): editable grid with a sticky header. Rows the rules doubt (price not in text, `512TB` storage, missing CPU) are highlighted. Products already known are matched automatically, similar ones are suggested ("Accept all matches", "Skip rows without price").
- **Compare** (`/procurement/compare`): search by model, part number or spec (`FM0013DX`, `probook 440`, `i5 13420h 16gb`, `ultra 7`). Each product lists every supplier's latest offer, with the best price highlighted, a trend arrow against that supplier's previous quote, and "saves up to X vs dearest". Filter by supplier category, ready stock only, price, brand and more; sort by suppliers, cheapest, biggest saving or newest. **Export CSV** (opens in Excel) and **Copy quote** (WhatsApp-ready text). Offers without a price show "Price on request". Old offers are greyed out.
- **Product** (`/procurement/products/[id]`): best / lowest-ever / average price and a price-over-time chart per supplier.
- **Price alerts** (`/procurement/alerts`): price drops (with "now the cheapest" flag), price rises, and suppliers that stopped sending lists. A badge in the sidebar counts this week's changes.
- **Suppliers** (`/procurement/suppliers`, `/procurement/suppliers/[id]`): each supplier has a **category** from the UAE IT trade, with filter chips and a badge everywhere (Compare, product, supplier page): Distributor, Big stockist, Market trader, DAFZA, JAFZA, SAIF Zone, Other free zone, Brand/OEM direct, Other. The detail page shows contact, how often they are the cheapest, their offers against the market best, and list history. Add or rename categories in `src/lib/supplier-types.ts`.
- **Search anywhere**: press `Ctrl K` (or `/`) to jump to a product or page.
- Also: price list history with filters and the original text, and an admin page for users, AI model and the "old offer" age.

## Stack

Next.js 16 (App Router), React 19, shadcn/ui (Base UI) + Tailwind CSS 4, Zustand, TanStack Query + Table 9, PostgreSQL 16 + `pg_trgm`, Drizzle ORM, Ollama, Docker Compose.

## Distributor Excel price lists

Upload the distributor's `.xlsx` (for example the Mitsumi Lenovo sheet with one tab per category). It is read by **rules, not the AI**, so a 100-row workbook is ready in about a second and the result is exact and repeatable.

- **Per sheet:** the header row is found automatically (P/N, description, price, stock), group headings such as "ThinkPad L14 Gen 7" are used as model names, merged cells and repeated headers are handled, and a header that names the wrong columns falls back to what the data looks like. Hidden sheets are skipped.
- **Per row:** the comma-separated spec (`L14 PTL,U5-325,16GB DDR5,512GB SSD...`) becomes CPU (`Core Ultra 5 325`), RAM, storage, display, OS, GPU, plus warranty and keyboard layout in "extras" so the Arabic and English SKUs stay distinct. The P/N is the part number, so the same SKU from a market trader matches automatically. Monitors and accessories get their model code, size, resolution and type.
- **You confirm:** supplier (or create one with its category), **currency**, **price basis** (such as `FOB JA`, read from the price column header), price list date, and which sheets to include. The category of each sheet can be changed. Then you review the rows and save, like any other list.
- **Currency:** these sheets usually do not state one (the Mitsumi sheet says only "LIST PRICE FOB JA"), so you are asked. USD prices are converted at the rate on the Admin page (default 3.6725, the dirham peg) whenever prices are ranked, so a USD distributor price and an AED market price compare fairly. The price is always shown in its own currency, with "about AED x" and its basis beside it. Other currencies are only compared with themselves.
- **Basis matters:** "FOB Jebel Ali" or "ex-VAT" is not the same as a delivered price with VAT. The basis is stored per offer and shown next to the price so nobody compares them blindly.
- **Live feeds:** a supplier who publishes their stock sheet at a link (e.g. a published Google Sheet) can be connected on their Suppliers page (admin). The background scheduler re-reads it every N minutes with rules only (the local AI is not used), saves a new price list only when the sheet changed, and marks products that vanished from the sheet as out of stock. Try a link without saving: `npm run try-feed -- <link>`.
- Try a file without saving anything: `npm run try-excel -- "C:\path\list.xlsx"`.
- Only `.xlsx` is supported (not old `.xls`), up to 15 MB and 5,000 rows.

## How parsing works (pasted WhatsApp text)

1. **Pre-clean** (rules): strip emojis, WhatsApp markers and ™, find headings ("Desktops" becomes a category hint) and the supplier signature.
2. **Chunk**: split into product blocks; send at most 8 blocks per model call to keep context (and RAM) small.
3. **Local LLM** via Ollama with a **JSON schema** in `format`, so the output is always valid JSON. `temperature 0`, `think: false`, string length caps and a token cap stop runaway output.
4. **Post-fix** (rules): normalise brand / part number / RAM, detect currency, condition and stock notes, and flag suspicious values. A price the model reports must appear in the original text.
5. **Review**: nothing is saved until a person clicks Save. A block the model fails on becomes a manual row, so nothing is lost silently.
6. **Learning**: when a reviewer corrects rows, the corrected block is stored and used as an example the next time that supplier's list is parsed.
7. **Skip what is already known**: before the model runs, every block is compared with the reviewed rows from that supplier's last 10 saved lists. An identical block (ignoring case and spacing) is copied, including the reviewer's include/exclude choice, and never sent to the model. Suppliers re-post mostly the same list, so a repeat list that took ~7 minutes comes back in under a second; only new or changed items are read by the AI. A changed price changes the block text, so it is read again.

Products are matched across suppliers by brand + part number + CPU model + RAM. Family codes such as Lenovo `15IRH10` cover several configurations, which is why CPU and RAM are part of the key. A vaguer quote of the same SKU (`U7` vs `Core Ultra 7 256V`) still matches.

### Model and speed

| Model | RAM | Sample list, 23 items, CPU only |
|---|---|---|
| `qwen3.5:4b` (default) | ~3.4 GB | ~7 min, 23/23 prices correct |
| `qwen3.5:2b` | ~2.7 GB | ~6 min, messier part numbers |

Measured on an Intel i5-13500T with no GPU. Output speed (~5.5 tokens/s) is the bottleneck. Parsing runs in the background, so people can keep working and queue several lists. A machine with an NVIDIA GPU or Apple Silicon is 5 to 20 times faster with no code change. Change the model on the Admin page.

## Run locally (development)

Requires Node 22, Docker, and [Ollama](https://ollama.com) on the host.

```bash
cp .env.example .env            # then set AUTH_SECRET to a long random string
ollama pull qwen3.5:4b
docker compose up -d db         # Postgres on localhost:5433
npm install
npm run db:migrate
npm run db:seed                 # creates ADMIN_EMAIL / ADMIN_PASSWORD from .env
npm run dev                     # http://localhost:3100
```

The background schedulers (AI queue and live feeds) run inside the Next.js server (`RUN_WORKER=true`). The local model only runs after an admin presses **Start** on the Admin page (or "Read waiting lists now"); until then pasted WhatsApp lists wait in the queue and the model stays unloaded. To run it as its own process, set `RUN_WORKER=false` and start `npm run worker`.

## Run with Docker

```bash
cp .env.example .env            # set AUTH_SECRET, ADMIN_PASSWORD
docker compose up -d --build    # db + web on http://localhost:3100, uses Ollama on the host
```

To run Ollama in Docker too (memory-capped by `OLLAMA_MEM_LIMIT`, model pulled automatically), set `DOCKER_OLLAMA_URL=http://ollama:11434` in `.env`, then run:

```bash
docker compose --profile ollama up -d --build
```

The web container applies migrations and seeds the admin user on start. Set `COOKIE_SECURE=true` when serving over HTTPS.

`GET /api/health` (public, no data) checks the web server and the database; Docker uses it as the web container healthcheck and you can point an uptime monitor at it.

### Backups

```bash
docker compose --profile backup up -d     # nightly pg_dump into ./backups, keeps BACKUP_KEEP_DAYS (default 14)
# restore:
gunzip -c backups/procurement-YYYYMMDD-HHMM.sql.gz | docker compose exec -T db psql -U zeronix procurement
```

Copy `./backups` off the machine as well; a backup on the same disk does not survive a disk failure.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3100 |
| `npm test` | Unit tests (parsing rules, chunking, matching, search) |
| `RUN_LLM_TESTS=true npx vitest run tests/llm-accuracy.test.ts` | Accuracy test against the real local model |
| `npm run try-parse -- <file> [model]` | Parse a text file and print the rows |
| `npm run try-feed -- <link-or-csv> [currency]` | Read a supplier's live feed and print what a sync would create |
| `npm run try-excel -- <file.xlsx> [rows] [currency]` | Read a distributor Excel file and print what would be imported |
| `npm run db:generate` | New migration after changing `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:studio` | Database tasks |

## Layout

```
src/lib/parse/     preclean, chunk, postfix, match, pipeline   (rules + orchestration)
src/lib/llm/       schema (zod + JSON schema), prompt, Ollama provider
src/lib/parse/whatsapp.ts, chatprefix.ts   chat-export splitting, copy-paste prefix stripping
src/lib/parse/excel.ts, excel-read.ts      distributor Excel: header/columns, spec string, brand, basis
src/lib/supplier-types.ts, currency.ts, fx.ts   supplier categories, USD/AED conversion
src/lib/products.ts product matching / creation
src/lib/search.ts  compare query, trend (previous quote), sort
src/lib/alerts.ts  price moves, quiet suppliers, list counts
src/lib/export.ts  CSV export and pasteable quote text
src/worker/        schedulers: AI queue (admin Start/Stop), live feeds
src/app/(app)/(home)/ home screen          src/app/(app)/admin/  users, apps, AI, settings
src/app/(app)/procurement/   overview, compare, import, alerts, products, price-lists, suppliers
src/lib/apps.ts, app-nav.ts  app registry + access rules, per-app sidebar pages
src/db/            Drizzle schema + migrations
```
