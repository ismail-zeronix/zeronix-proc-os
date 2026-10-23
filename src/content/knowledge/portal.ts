import type { Article } from "./types";

const REVIEWED = "2026-10-21";

export const PORTAL: Article[] = [
  {
    slug: "portal-daily-routine",
    section: "portal",
    title: "Your day in the portal",
    summary: "Punch in, check tasks and mail, follow up enquiries, and punch out: the routine in ten steps.",
    tags: ["how to", "routine", "punch in", "punch out", "attendance", "tasks", "start", "help", "guide"],
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
          "Every new enquiry goes into Sales → New deal, even a WhatsApp message. Use Ctrl K to check the company is not already there.",
          "Log every call, message and meeting on the deal timeline, and set a follow-up task with a date.",
          "Prices: Procurement → Compare prices, or Find price on the deal's Quote tab. The margin is added for you.",
          "Make the quote from the deal, print it or copy it as WhatsApp text, and mark it Sent.",
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
      { h: "Where things are" },
      {
        table: {
          head: ["I want to", "Go to"],
          rows: [
            ["Find anything (company, person, deal, quote, order, invoice)", "Ctrl K"],
            ["Add a task quickly", "+ Task at the top"],
            ["Change my password or signature, see my attendance", "My account (your name, top right)"],
            ["Share a document with the team", "Files"],
            ["See what a customer owes", "Accounts → Customers (if you have Accounts)"],
          ],
        },
      },
    ],
  },
  {
    slug: "portal-quote-to-money",
    section: "portal",
    title: "From quote to money",
    summary: "Accepted quote → sales order → delivery note → tax invoice → payment, and who does each step.",
    tags: ["order", "sales order", "lpo", "po", "delivery note", "invoice", "tax invoice", "payment", "receipt", "credit note", "statement", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "The steps" },
      {
        table: {
          head: ["Step", "Who", "Where"],
          rows: [
            ["1. Customer confirms: Convert to order (PO number, credit terms, delivery address)", "Sales", "The quote page"],
            ["2. Upload the customer's PO / LPO", "Sales", "Order → Files tab"],
            ["3. Proforma invoice, if they pay before delivery", "Sales", "Order → Proforma"],
            ["4. Goods go out: Mark delivered, print the delivery note for signature", "Sales", "Order page"],
            ["5. Upload the signed delivery note", "Sales", "Order → Files tab"],
            ["6. Make invoice: the tax invoice gets its number", "Accounts", "Accounts → To invoice, or the order page"],
            ["7. Money in: Record payment (cash or bank transfer, full or part)", "Accounts", "The invoice page"],
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
          "Customer statement of account: Accounts → Customers → the customer → Print.",
        ],
      },
      { tip: "Before the first invoice, an admin fills in Admin → Settings → Documents: our TRN, bank details and the next invoice number (continuing from Zoho)." },
    ],
  },
];
