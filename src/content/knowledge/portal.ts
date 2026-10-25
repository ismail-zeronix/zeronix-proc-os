import type { Article } from "./types";

const REVIEWED = "2026-10-25";

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
          "Every new lead goes into CRM → Deals → New deal, even a WhatsApp message. Use Ctrl K to check the company is not already there.",
          "Log every call, message and meeting on the deal's Activity tab, and set a follow-up task with a date.",
          "Make the quote in Sales → Quotes → New quote (or Make quote on the deal's Quotes tab). Find price brings in supplier prices; the margin is added for you.",
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
            ["CRM", "Deals (the pipeline), companies and contacts: everything before the customer says yes"],
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
            ["1. Make the quote: lines, Find price, Make quote", "Sales", "Sales → Quotes → New quote"],
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
      { tip: "Before the first invoice, an admin fills in Admin → Settings → Documents: our TRN, bank details and the next invoice number (continuing from Zoho)." },
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
];
