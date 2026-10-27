# Go-live and order-to-cash plan (October 2026)

> **Update 2026-10-25:** Sales is now **CRM**; quotes, orders, invoices, payments, supplier bills, expenses and reports live in **Accounts**, and the portal replaces Zoho Books (see TASKS.md Phase 15). Steps below that say "Sales" for quotes and orders now mean Accounts.

Two goals, in this order:

1. **Today: the sales team starts using the portal** for what is already built (enquiries, deals, price comparison, quotes, tasks, mail, punch in/out).
2. **Next: close the loop from an accepted quote to money in the bank**: sales order, delivery note, tax invoice, payment, statement.

Orders, invoices and payments touch money and tax, so they are built one at a time and checked on real examples before the team uses them. They are **not** squeezed into today.

---

## Part A: go-live today (Phase 8)

What exists is enough for a sales team to work: lead → deal → find price → quote → sent → accepted/won. What is missing before handing it over is mostly operations and safety, not features.

### A1. Must do before anyone logs in (blockers)

| # | Task | Why it blocks | Size |
|---|---|---|---|
| 8.1 | **Commit the work and rebuild the Docker `web` container.** The running container (port 3200) is an old build without quotes, attendance and the UI pass. Migrations 0011 and 0012 run on start. | The team would get yesterday's app. | S |
| 8.2 | **Turn on nightly backups** (`docker compose --profile backup up -d`), run one by hand, and **test a restore** into a throwaway database. Copy backups off the machine (Google Drive / USB / second PC) once a day. | Today there is no backup at all; one disk failure loses every customer, deal and quote. | S |
| 8.3 | **Change the default admin password**; make sure `AUTH_SECRET` in `.env` is long and random. | The default is in the README. | S |
| 8.4 | **Let users change their own password** (My account → Security tab). New users get a temporary password from the admin and change it on first login. | Today only an admin can set passwords, and the admin then knows everyone's. | S |
| 8.5 | **Slow down password guessing**: lock an email for 15 minutes after 5 wrong passwords, log failed logins. | The login page will be reachable by everyone on the network. | S |
| 8.6 | **Decide how the team reaches it.** Office only: `http://<server-ip>:3200` on the LAN. From outside: put it behind HTTPS (Cloudflare Tunnel or Tailscale, no open ports) and set `COOKIE_SECURE=true`. Never expose port 3200 to the internet as plain HTTP. | Passwords and customer data cross the network. | S |
| 8.7 | **Company details for documents**: our TRN, address, phone, bank name, IBAN and account name (new settings), so quotes now and invoices later carry them. | A quote without our TRN is not usable by most corporates. | S |
| 8.8 | **Remove scratch files** (`_qtest.ts`, `_wtest.ts`, `_wtest2.ts`) and run the full check: typecheck, lint, tests, build. | Clean release. | S |

### A2. Setup for each salesperson (30 minutes, with the admin)

- Create the user (Admin → Users → +), pick their apps (Sales, Procurement, Tasks, Mail, Knowledge).
- They log in, change the password, punch in, set job title and mobile (My account → Email signature), connect their mailbox (My account → Mailbox).
- Admin → Settings: check work hours and off days, quote margin, validity, VAT, terms.

### A3. Strongly recommended today (not blockers)

| # | Task | Why | Size |
|---|---|---|---|
| 8.9 | **Import existing customers and contacts from Excel/CSV** (Sales → Companies → Import), with duplicate check on the normalised name. | If the team already has a customer list, typing it in by hand will not happen. | M |
| 8.10 | **End-to-end smoke test as a sales user** (not admin): enquiry → deal → Find price → quote → print/PDF → WhatsApp text → mark sent → accepted → deal Won. Also: a sales user cannot open Admin, cannot see another user's mailbox. | Admin sees everything, so admin testing hides permission bugs. | S |
| 8.11 | **Punch rule on the server too**: server actions refuse to run when the user is not punched in (today only the browser blocks clicks). | The rule is easy to get around otherwise. | S |
| 8.12 | **"How to use the portal" page in Knowledge**: the daily routine in 10 steps with screenshots. | Saves repeating the same answers on day one. | S |
| 8.13 | **Error log**: write server errors to a file / `docker logs` with the user and page, and an Admin page to read the last 100. | First-week problems need to be seen, not guessed. | S |

**Exit for Part A:** every salesperson can log in from where they work, punch in, create a deal and send a quote; last night's backup exists and was restored once.

---

## Part B: order-to-cash (Phases 9 to 11)

### The flow

```
Deal ──► Quote (accepted) ──► Sales order ──► Delivery note(s) ──► Tax invoice(s) ──► Payment(s) ──► Statement / receivables
             │                    │                                    │
             │                    └─ proforma invoice (for advance)    └─ credit note (to correct or cancel)
             └─ customer LPO / PO number + file
```

Rules that hold everywhere:
- **Documents copy their lines** from the one before (quote → order → invoice), so later edits upstream never change a document already issued.
- **Numbers are sequential with no gaps**, one series per document type per year, allocated inside the same database transaction that saves the document (same method as quote numbers): `ZSO-2026-0001` order, `ZDN-` delivery note, `ZINV-` tax invoice, `ZCN-` credit note, `ZRV-` receipt.
- **An issued tax invoice is never edited or deleted.** Mistakes are fixed with a credit note, then a new invoice.
- **Every money document keeps who did what and when** (audit log, see 12.2).
- Costs and profit stay inside the portal; they never print.

### Phase 9: Sales orders and delivery

**9.1 Data**
- `sales_orders`: number, deal, company, contact, quote it came from, **customer LPO/PO number and date**, LPO file, delivery address, payment terms (advance % and credit days), expected delivery date, status, totals, VAT %, created by/at.
- `sales_order_items`: copied from the accepted quote lines; also carries cost and supplier from the deal line (for profit and buying), qty ordered, qty delivered, qty invoiced.
- `delivery_notes` + `delivery_note_items`: number, date, lines and quantities delivered, received-by name, signed copy upload.
- `attachments` (shared): file on a Docker volume (`/data/uploads`), owner type and id, uploaded by. Used for LPOs, signed delivery notes, payment proofs.

**9.2 Screens**
- Accepted quote → **Convert to sales order** button. A dialog asks for the LPO number/date/file and payment terms. One order per quote (a second click opens the existing one).
- Sales → **Orders** list (status chips, customer, total, delivered %, invoiced %, owner avatar) and order page (header, stat strip, tabs: Lines, Deliveries, Invoices, Payments, Files, Timeline).
- **Order statuses:** Confirmed → Buying (some lines not yet bought from the supplier) → Ready → Part delivered → Delivered → Closed; Cancelled (only when nothing is invoiced).
- **Buying checklist per line** (light purchasing, not a full purchase module): supplier, our cost, "ordered from supplier" tick and date, "received in stock" tick. Feeds a "To buy" list for whoever does purchasing.
- **Delivery note:** pick lines and quantities (partial delivery allowed), print/PDF with the customer's signature box, upload the signed copy.
- **Proforma invoice** print from the order (clearly titled "Proforma", no tax-invoice number) for customers who pay in advance.
- The order also moves the deal: creating it marks the deal **Won** if it is not already.

**9.3 Checks:** totals equal the quote; a cancelled quote cannot be converted; partial deliveries add up; a sales user only sees orders for deals they can see.

### Phase 10: Tax invoices and credit notes

**10.1 Data**
- `invoices`: number, date of issue, **date of supply**, order, company (name, address and **TRN copied at issue**), lines copied from the order (description, qty, unit price, VAT %, VAT amount, line total), subtotal, VAT, total in AED, due date (from terms), status, issued by.
- `credit_notes`: number, date, invoice it corrects, reason, lines/amounts, VAT.

**10.2 UAE tax invoice content** (check the final layout with your accountant): the words **"Tax Invoice"**; our name, address and **TRN**; the customer's name, address and TRN (when registered); invoice number and date; date of supply when different; description, quantity, unit price, VAT rate and VAT amount per line; totals in AED. Bank details (IBAN) for payment at the bottom.

**10.3 Screens**
- Order → **Make invoice**: invoice everything delivered and not yet invoiced (or pick lines). Preview, then **Issue** (gets the number, locks it).
- Invoice page: print/PDF, **email it from the portal** (PDF attached, uses the user's mailbox and signature), WhatsApp text, status, payments received, balance.
- **Credit note** from an invoice (whole or part), with reason; the invoice balance updates.
- Sales → **Invoices** list: number, customer, date, due, total, paid, balance, overdue badge.

**10.4 Checks:** numbers have no gaps even when two people issue at the same moment (test it); an issued invoice cannot change; VAT rounding per line matches the total; credit note can never exceed what is left on the invoice.

**Note:** the UAE is introducing mandatory e-invoicing in stages. Confirm the dates that apply to Zeronix with your accountant. The data above is kept structured, so an export to an e-invoicing provider or to accounting software can be added later.

### Phase 11: Payments, receivables and statements

**11.1 Data**
- `payments`: number (`ZRV-`), date, company, amount, method (**bank transfer, cheque, cash, card**), reference, cheque number, bank and **cheque date (post-dated cheques)**, cheque status (pending / cleared / bounced), proof file, recorded by.
- `payment_allocations`: which invoices a payment pays and how much; money not yet allocated stays as **customer advance / credit**.

**11.2 Screens**
- Invoice or company → **Record payment**; allocation suggested oldest-first, editable.
- **Receipt voucher** print/PDF.
- **PDC register**: cheques by due date; mark cleared or bounced (bounced reopens the invoice and creates a follow-up task).
- **Customer statement of account** for a date range (opening balance, invoices, credit notes, payments, running balance), print/PDF/email.
- **Receivables dashboard** (Sales overview tab or a new Accounts app): total owed, overdue, ageing buckets 0-30 / 31-60 / 61-90 / 90+, top customers by overdue amount, collected this month.
- **Collection follow-ups**: a task for the deal owner on the due date and again at +7 days when unpaid; overdue invoices show on the home "Needs your attention" card.

**11.3 Checks:** allocations never exceed invoice balance or payment amount; statement balance equals invoices − credit notes − payments; bounced cheque restores the balance.

### Phase 12: Needed alongside 9-11

| # | Task | Why |
|---|---|---|
| 12.1 | **Accounts permission**: who may issue invoices, record payments, cancel. A new grantable app "Accounts" (already listed as coming soon) or an "accounts" role flag. Sales can see their customers' balances but not record payments. | Money documents need separation of duties. |
| 12.2 | **Audit log**: one table for create/issue/cancel/payment events with user, time, before/after. Shown on each document's Timeline tab. | Required to trust the numbers. |
| 12.3 | **Export**: invoices, credit notes and payments to Excel for the accountant (monthly VAT return), and later an export/API to the accounting software. | The VAT return is done from these. |
| 12.4 | **Document settings in Admin**: number prefixes and next number (to continue your current series), default payment terms, invoice footer, bank details. | Fit the existing paperwork. |
| 12.5 | **Notifications** (your own task in Tasks): in-app toasts for assigned tasks, quote accepted, payment received, invoice overdue. | Makes the flow visible without hunting. |

---

## Order of work and size

| Step | Content | Size |
|---|---|---|
| **Today** | Part A blockers 8.1-8.8, then 8.10 smoke test; 8.9 import if you have a customer list | 1 session |
| Next | Phase 9 sales orders + delivery notes + proforma, with 9.1 attachments and 12.2 audit log | 1-2 sessions |
| Then | Phase 10 tax invoices + credit notes + email PDF, 12.4 settings | 1-2 sessions |
| Then | Phase 11 payments, PDC, statements, receivables, 12.1 permission, 12.3 export | 2 sessions |
| After | 12.5 notifications, 8.11-8.13 if not done, central company files | 1 session |

Each phase ends with tests (number allocation under concurrency, totals, permissions), screenshots at laptop and phone width, and a run-through on a real past order before the team uses it.

---

## Decisions needed from the owner

1. **Accounting software:** does your accountant use Zoho Books, Tally, QuickBooks or another system? Either the portal issues the official tax invoice and exports to it, or the portal makes orders and proformas and the accounting system issues the invoice. This changes Phase 10.
2. **Numbering:** continue an existing invoice series (what is the last number?) or start fresh in the portal.
3. **Partial deliveries and partial invoicing:** needed (common for IT orders), or always one delivery and one invoice per order?
4. **Payments:** which methods you actually take (post-dated cheques?), and **who records payments**: admin only, or an accounts person.
5. **Bank details** to print on invoices, and our TRN and registered address.
6. **Access:** office network only, or from outside (then HTTPS via Cloudflare Tunnel or Tailscale).
7. **Customer list:** is there an Excel file to import today?
