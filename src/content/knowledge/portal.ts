import type { Article } from "./types";

const REVIEWED = "2026-10-26";

export const PORTAL: Article[] = [
  {
    slug: "portal-daily-routine",
    section: "portal",
    title: "Your day in the portal",
    summary: "Punch in, check tasks and mail, follow up deals, quote, and punch out: the routine in ten steps.",
    tags: ["how to", "routine", "punch in", "punch out", "attendance", "tasks", "start", "help", "guide", "crm", "deal"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Start of the day" },
      {
        ol: [
          "Sign in and punch in: the switch next to the welcome message, or click the clock at the top of any page. Nothing works until you punch in.",
          "Punching in after 9:30 AM asks for a reason. Pick one or type your own.",
          "Look at My tasks today on the home screen. Overdue tasks are red; do those first.",
          "Check Latest emails and the Deals going quiet card. Reply to customers before anything else.",
        ],
      },
      { h: "During the day" },
      {
        ol: [
          "Every new enquiry goes into CRM → Leads → New lead, even a WhatsApp message. Use Ctrl K to check the company is not already there. Once you know what, how many and by when, press Qualify: it moves to CRM → Deals.",
          "Log every call, message and meeting on the deal's Activity tab, and set a follow-up task with a date.",
          "Make the quote in Sales → Quotes → New quote. Pick the customer; link the CRM deal when you are quoting a lead, or leave it as an instant quote for an existing customer. Find price brings in supplier prices; the margin is added for you.",
          "You can make a quote in a colleague's name (Salesperson): it is theirs, signed by them, and you can still see it.",
          "Print the quote or copy it as WhatsApp text, and mark it Sent. The deal's Quotes tab shows it, read only.",
        ],
      },
      { h: "End of the day" },
      {
        ol: [
          "Make sure every open deal you touched has a next task with a date.",
          "Punch out. Leaving before 9:30 PM (outside the 2:30 to 4:30 PM break) asks for a reason.",
        ],
      },
      { tip: "Forgot to punch out? The portal closes the session at 9:30 PM and marks it, so tell your manager the real time." },
      { h: "Which app for what" },
      {
        table: {
          head: ["App", "What is in it"],
          rows: [
            ["CRM", "Leads, deals (the pipeline), companies and contacts: everything before the customer says yes"],
            ["Sales", "Customers (companies whose deal is won), quotes and orders"],
            ["Accounts", "The accounts team: invoices, payments, supplier bills, expenses and reports"],
            ["Procurement", "Supplier price lists and Compare prices"],
            ["Projects", "Project deals: BOQ, proposal, checklist"],
          ],
        },
      },
      { h: "Where things are" },
      {
        table: {
          head: ["I want to", "Go to"],
          rows: [
            ["Find anything (company, person, deal, quote, order, invoice)", "Ctrl K"],
            ["Add a task quickly", "+ Task at the top"],
            ["Make or change a quote", "Sales → Quotes"],
            ["Turn an accepted quote into an order, mark it delivered", "The quote page, then Sales → Orders"],
            ["See what a customer owes", "Sales → Customers → the customer"],
            ["Change my password or signature, see my attendance", "My account (your name, top right)"],
            ["Share a document with the team", "Files"],
          ],
        },
      },
    ],
  },
  {
    slug: "portal-quote-to-money",
    section: "portal",
    title: "From quote to money",
    summary: "Quote → sales order → delivery note → tax invoice → payment, and who does each step.",
    tags: ["quote", "order", "sales order", "lpo", "po", "delivery note", "invoice", "tax invoice", "payment", "receipt", "credit note", "statement", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "The steps" },
      {
        table: {
          head: ["Step", "Who", "Where"],
          rows: [
            ["1. Make the quote: customer, (deal), lines, Find price, Make quote", "Sales", "Sales → Quotes → New quote, or New quote on the customer page"],
            ["2. Customer confirms: Convert to order (PO number, credit terms, delivery address)", "Sales", "The quote page"],
            ["3. Upload the customer's PO / LPO", "Sales", "Order → Files tab"],
            ["4. Proforma invoice, if they pay before delivery", "Sales", "Order → Proforma"],
            ["5. Goods go out: Mark delivered, print the delivery note for signature", "Sales", "Order page"],
            ["6. Upload the signed delivery note", "Sales", "Order → Files tab"],
            ["7. Make invoice: the tax invoice gets its number", "Accounts team", "Accounts → To invoice, or the order page"],
            ["8. Money in: Record payment (cash or bank transfer, full or part)", "Accounts team", "The invoice page"],
          ],
        },
      },
      { h: "Good to know" },
      {
        ul: [
          "One order per quote, one delivery and one invoice per order.",
          "Credit terms (cash, 7, 15, 30 days...) set the due date. After the due date the invoice shows as Overdue.",
          "When the invoice is issued, the deal owner gets a task to collect the money on the due date. It closes itself when the invoice is fully paid.",
          "An issued invoice cannot be edited. A mistake is fixed by Cancel invoice (a credit note), then a new invoice from the same order.",
          "A payment entered by mistake is voided, not deleted, so the receipt numbers stay complete.",
          "Bank transfers need the transfer reference so they can be matched on the bank statement.",
          "Customer statement of account: Sales → Customers → the customer → Statement → Print.",
        ],
      },
      { tip: "Before the first invoice, an accountant fills in Accounts › Settings: our TRN (VAT registration), bank details (Terms and bank details) and the next invoice number (Document numbers, continuing from Zoho)." },
    ],
  },
  {
    slug: "portal-bills-and-reports",
    section: "portal",
    title: "Bills, expenses and reports (accounts team)",
    summary: "Supplier bills and payments, expenses paid on the spot, opening balances from Zoho, and the reports for the accountant.",
    tags: ["bill", "supplier", "expense", "payment voucher", "vat", "profit and loss", "p&l", "report", "zoho", "opening balance", "accounts", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Money going out" },
      {
        table: {
          head: ["It is", "Enter it as", "Where"],
          rows: [
            ["A supplier's invoice, paid later", "Bill (their invoice number, date, lines, VAT)", "Accounts → Bills → New bill"],
            ["Goods or work bought for a customer order", "Bill, with the order picked: it becomes that order's real cost", "Same, or the order page → + Add bill"],
            ["Fuel, rent, a visa fee, anything paid on the spot", "Expense (saved together with its payment)", "Accounts → Expenses → New expense"],
            ["Paying a bill, in full or in part", "Pay on the bill (cash or bank transfer with the reference)", "The bill page"],
          ],
        },
      },
      {
        ul: [
          "The same supplier invoice cannot be entered twice: the portal checks their invoice number.",
          "Every payment gets a payment voucher (ZPV) to print and sign.",
          "Mistakes are voided with a reason, never deleted. A bill with payments needs its payments voided first.",
          "Supplier TRN, credit terms and bank details: Accounts → Suppliers → the supplier → Billing details. Prices stay in Procurement.",
        ],
      },
      { h: "Moving over from Zoho" },
      {
        ol: [
          "Pick a cut-over date (for example the 1st of the month). Everything after it is entered only in the portal.",
          "For each customer invoice still unpaid in Zoho on that date: Accounts → Invoices → Opening balance (Zoho number, date, what is still owed).",
          "For each supplier bill still unpaid: Accounts → Bills → Opening balance.",
          "Opening balances count in what is owed both ways, but not in profit or VAT: those months were reported from Zoho.",
        ],
      },
      { h: "Reports" },
      {
        ul: [
          "Accounts → Reports: profit and loss, VAT summary, customers owe, we owe suppliers, sales, profit per order, cash in and out.",
          "Pick a period (this month, last quarter...) or two dates. Excel (CSV) downloads exactly what is on screen for the accountant.",
          "Profit is by invoice and bill date, before VAT. Salaries, rent and other running costs only show if they are entered as expenses.",
        ],
      },
      { tip: "The VAT summary is a working paper: check zero-rated, exempt and reverse-charge items with the accountant before filing the return." },
    ],
  },
  {
    slug: "portal-claude",
    section: "portal",
    title: "Use Claude with ZeronixOS",
    summary: "Connect Claude to the portal so it can read your figures, suggest what to do next and, if you allow it, add tasks, notes, leads and draft quotes.",
    tags: ["claude", "ai", "assistant", "mcp", "connector", "admin", "sales", "how to", "setup", "disconnect"],
    reviewed: "2026-11-24",
    blocks: [
      { h: "What it is" },
      {
        p: "Claude (claude.ai on the web, the Claude desktop app and the Claude phone app) can look at live ZeronixOS data while you chat: deals, customers, quotes, orders, tasks and supplier prices, and with the Accounts app also money owed, bills and reports. Ask it what needs attention and it answers from the real figures, with links back to the records. Admins and sales staff can connect. It uses your own claude.ai plan, so there is nothing extra to pay to Zeronix.",
      },
      {
        p: "Claude sees exactly what you see in the portal. A salesperson on Own deals sees only the deals they are on, and gets no money or report tools without the Accounts app. Admins and All data users see everything.",
      },
      { h: "Connect it (once)" },
      {
        ol: [
          "Open claude.ai and go to Settings → Connectors → Add custom connector.",
          "Name: ZeronixOS. Address: https://zeronixos.online/api/mcp. Press Add.",
          "Press Connect. The ZeronixOS sign-in page opens; sign in with your own account (never someone else's).",
          "On the next page, Read is always on. Tick Write only if you want Claude to be able to add or change records. Press Allow.",
          "Done. The connector now also works in the Claude desktop and phone apps under the same claude.ai account.",
        ],
      },
      {
        p: "Claude Code (for developers): run claude mcp add --transport http zeronix https://zeronixos.online/api/mcp, then type /mcp in Claude Code and sign in the same way.",
      },
      { h: "Things to ask" },
      {
        ul: [
          "What needs my attention today?",
          "Which customers owe us money for more than 60 days, and how much?",
          "Which deals have gone quiet this week? Suggest a follow-up for each.",
          "Show the profit and loss for last month and compare it with the month before.",
          "Which supplier bills are due in the next 7 days?",
          "What does (customer name) have open with us: deals, quotes and unpaid invoices?",
          "Find the best supplier price for a Dell Latitude 5450.",
          "Add a follow-up task for me on that deal for Thursday. (needs Write)",
          "Make a draft quote for that deal with 10 laptops at the price we discussed. (needs Write)",
        ],
      },
      { h: "What Claude can and cannot do" },
      {
        table: {
          head: ["", "What"],
          rows: [
            ["Read (always)", "Business overview, search, your deals, customers, quotes, sales orders, your tasks, supplier prices, the team. With Accounts: money owed, bills due, reports (P&L, balance sheet, cash flow, ageing, sales, VAT and more). With Website: web shop orders"],
            ["Write (only if you ticked Write)", "Create a task or follow-up, add a note or log a call, update a deal (stage, value, close date, won or lost), add a lead or a new customer, make a DRAFT quote"],
            ["Never", "Delete anything, post invoices, payments, bills or journals, send emails or WhatsApp to customers, send a quote"],
          ],
        },
      },
      {
        ul: [
          "Claude asks you in the chat before every change. The change is saved in your name, exactly as if you made it in the portal, with the same checks.",
          "Sales staff must be punched in for Claude to make changes, the same as in the portal. Reading works any time.",
          "Notes and timeline entries Claude adds end with (via Claude), so the team can see where they came from.",
          "Draft quotes stay drafts: check the prices and send them yourself from Sales → Quotes.",
          "Claude can be wrong. Check figures that matter (VAT, payroll, large amounts) in the portal before acting on them.",
        ],
      },
      { h: "See what it did, and disconnect" },
      {
        ul: [
          "Admins: Admin → Claude lists who is connected, read or read + write, and when it was last used.",
          "The same page shows every change Claude made: when, by whose connection, and what.",
          "Disconnect on that page cuts Claude off at once. To connect again, press Connect in claude.ai.",
          "Sales staff: to disconnect, ask an admin, or change your password (that disconnects Claude everywhere).",
          "Changing your password, Sign out everywhere, or a deactivated account also disconnects Claude.",
        ],
      },
      { h: "If something goes wrong" },
      {
        table: {
          head: ["You see", "Do this"],
          rows: [
            ["Claude asks you to sign in again", "Normal after a disconnect, a password change, or 90 days without use. Press Connect and sign in."],
            ["Not available on the sign-in page", "Your account cannot connect Claude. Ask an admin."],
            ["Claude says to punch in first", "Punch in in the portal (the clock at the top), then ask Claude again."],
            ["Claude says it cannot make changes", "You connected with Read only. Disconnect (an admin can do it in Admin → Claude), then connect again and tick Write."],
            ["Claude cannot find a deal or customer", "It is probably not one of yours. Claude sees what you see in the portal."],
            ["Payroll questions are not answered", "Payroll is not connected to Claude yet; it is coming in a later update."],
          ],
        },
      },
    ],
  },
];
