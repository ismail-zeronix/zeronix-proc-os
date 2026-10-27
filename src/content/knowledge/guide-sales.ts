import type { Article } from "./types";

// Step-by-step guide to the Sales app. Screenshots in public/help/ come from a demo database with made-up companies.
const REVIEWED = "2026-10-26";

export const SALES_GUIDE: Article[] = [
  {
    slug: "sales-at-a-glance",
    section: "sales",
    title: "Sales at a glance",
    summary: "What the Sales app is for, its sidebar, and how to read the Sales overview.",
    tags: ["sales", "overview", "dashboard", "quotes sent", "win rate", "expected profit", "needs attention", "how to", "guide"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "The Sales app holds what we sell and to whom: customers (companies whose deal was won), quotes and sales orders. Leads and deals live in the CRM; invoices and payments live in Accounts. The three apps show the same records, so nothing is copied between them.",
      },
      {
        table: {
          head: ["Item", "What it is for"],
          rows: [
            ["Overview", "Quotes sent, win rate, quotes waiting for an answer, expected profit and what needs attention"],
            ["Customers", "Every customer with what is in progress, what they bought and what they owe"],
            ["Quotes", "Every quotation (ZQ-year-number), with its status"],
            ["Sales orders", "Accepted quotes turned into orders (ZSO-year-number): what to deliver and what to invoice"],
          ],
        },
      },
      { h: "The Sales overview" },
      { img: "/help/sales-overview.webp", alt: "Sales overview with KPI tiles, quoted and ordered chart, who and what sold, sales by salesperson and needs attention", caption: "Sales › Overview. Team / Mine switches between the whole team and your own quotes and orders." },
      {
        table: {
          head: ["Tile or panel", "What it tells you"],
          rows: [
            ["Quotes sent", "Value of the quotes sent in the period"],
            ["Quote win rate", "Of the quotes the customer answered, how many were accepted"],
            ["Waiting for an answer", "Value and number of sent quotes with no answer yet"],
            ["Expected profit", "Selling price minus quoted cost on the sales orders, and the margin %"],
            ["Quoted and ordered", "Quoted and ordered value per week or month, before VAT"],
            ["Who and what sold", "Top customers and top items on sales orders"],
            ["Sales by salesperson", "Quotes and orders per person"],
          ],
        },
      },
      { h: "Needs attention" },
      {
        table: {
          head: ["Tab", "What to do"],
          rows: [
            ["Ran out", "Sent quotes past their valid-until date with no answer: call the customer, then give a new date or mark it rejected"],
            ["Waiting", "Sent quotes waiting for an answer; amber ones run out within 3 days"],
            ["To deliver", "Sales orders not delivered yet"],
            ["Drafts", "Quotes made but not sent: send them or delete them"],
          ],
        },
      },
    ],
  },
  {
    slug: "sales-customers",
    section: "sales",
    title: "Customers",
    summary: "The customer list, its filters and badges, owners, and the customer page with orders, quotes and statement.",
    tags: ["customer", "customers", "owner", "owes", "overdue", "trn", "statement", "statement of account", "sales", "how to"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "A company becomes a customer when one of its deals is won. Its record is the same company you see in the CRM; the Sales side shows the money and documents.",
      },
      { img: "/help/sales-customers.webp", alt: "Customers list with filters, badges, contact, owners, in progress, sales and owes columns", caption: "Sales › Customers. Right-click a row for quick actions." },
      { h: "Filters and badges" },
      {
        table: {
          head: ["Filter", "Shows"],
          rows: [
            ["All / Mine", "Every customer you can see, or the ones you own"],
            ["Owe us / Overdue", "Customers with unpaid invoices, or with invoices past their due date"],
            ["In progress", "Customers with an open deal, an open quote or an order still to deliver"],
            ["No TRN", "Customers without a TRN: save it before the tax invoice"],
          ],
        },
      },
      {
        ul: [
          "Top: one of the biggest customers by sales orders. New: became a customer in the last 30 days. Repeat: ordered more than once.",
          "No TRN and No contact badges are reminders of details still missing.",
        ],
      },
      { h: "The right-click menu" },
      {
        ul: [
          "Open customer, New quote (a quick quote with the customer already picked), Statement.",
          "Contacts and deals in CRM opens the company in the CRM.",
          "Owners: everyone who looks after the customer; the first is the main owner. Only admins and \"All data\" users change owners.",
          "Copy the name, TRN or phone in one click.",
        ],
      },
      { h: "The customer page" },
      { img: "/help/sales-customer.webp", alt: "Customer page with balance tiles and tabs for invoices, sales orders, quotes and statement", caption: "A customer page: what they owe today, what is overdue, what was invoiced and paid in the period." },
      {
        ul: [
          "New quote: an instant quote for this customer, no deal needed.",
          "The details button edits the TRN, billing address and other details used on invoices.",
          "Tabs: Invoices, Sales orders, Quotes and Statement.",
          "Statement: pick From and To dates and print the statement of account for the customer.",
        ],
      },
    ],
  },
  {
    slug: "sales-make-quote",
    section: "sales",
    title: "Making a quote",
    summary: "The quote form step by step: customer, deal or instant quote, salesperson, terms, VAT, lines with cost and margin, Find price.",
    tags: ["quote", "quotation", "new quote", "find price", "margin", "cost", "vat", "zero-rated", "instant quote", "salesperson", "terms", "sales", "how to"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "Every quote is made in Sales › Quotes, for product deals and for quick sales to existing customers. Project deals are priced as a BOQ in the Projects app instead (see the Projects guide).",
      },
      { h: "Where to start" },
      {
        ul: [
          "From a CRM deal: Quotes tab › Make quote. The customer, deal and contact are filled in.",
          "From a customer: New quote on the customer page, or right-click the customer in the list.",
          "From scratch: Sales › Quotes › New quote, then type the company name.",
        ],
      },
      { img: "/help/sales-quote-form.webp", alt: "Quote form with customer, commercial terms and totals on the left and item lines on the right", caption: "The quote form. Left: customer, commercial terms and totals. Right: the lines, then terms and internal notes." },
      { h: "Step by step" },
      {
        ol: [
          "Customer: type the company name and pick it. A company that is not found must be added in the CRM first.",
          "CRM deal: pick the deal you are quoting, or leave \"None: instant quote\" for a quick sale to an existing customer.",
          "Contact: the person the quote is addressed to.",
          "Salesperson: the person who signs the quote. You can make a quote in a colleague's name; it is theirs and you can still see it.",
          "Payment: Cash or the number of days of credit. It is carried to the sales order and the invoice.",
          "Valid until: the last day the prices hold.",
          "VAT: Standard 5%, or Zero-rated (for example exports outside the UAE).",
          "Lines: press Find price to pick a supplier price, or Add line to type one.",
          "Write the terms and conditions (printed) and any internal notes (never printed).",
          "Press Make quote. The quote gets its ZQ number and opens.",
        ],
      },
      { h: "Cost, margin and price" },
      {
        ul: [
          "Each line has a unit cost (what we pay), a margin % and a unit price (what the customer pays, before VAT).",
          "Change the cost or the margin and the price follows. Type a price yourself and the margin is worked out.",
          "Find price searches the supplier price lists from Procurement and adds the offer with its cost and supplier name; the margin is added for you. It needs the Procurement app.",
          "Profit (internal) under the totals is for us only: costs, margins and suppliers are never printed on the quote.",
        ],
      },
      { tip: "Quote the exact part number from the supplier list, not just the model name: the same model exists with different CPUs, RAM and keyboards." },
    ],
  },
  {
    slug: "sales-send-quote",
    section: "sales",
    title: "Sending and following up a quote",
    summary: "The quote page: status, edit, WhatsApp text, email with PDF, print, validity, and what Accepted does.",
    tags: ["quote", "send", "email", "pdf", "print", "whatsapp", "status", "sent", "accepted", "rejected", "expired", "valid until", "sales", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { img: "/help/sales-quote.webp", alt: "Quote page with the quotation preview, status, edit, WhatsApp, email and print buttons, and the internal panel", caption: "A quote page. The left is the quotation exactly as the customer gets it; the right is for the team only." },
      { h: "Sending it" },
      {
        ul: [
          "Email (envelope): sends the quote from your own mailbox with your signature and the PDF attached. Needs the Mail app.",
          "Copy as WhatsApp text: copies a short version of the quote to paste in WhatsApp.",
          "Print / PDF: opens a clean page to print or save as PDF.",
          "Then set the status to Sent. The deal moves to Quote sent by itself.",
        ],
      },
      { h: "The status" },
      {
        table: {
          head: ["Status", "Means", "What happens"],
          rows: [
            ["Draft", "Made, not yet sent", "Shows under Drafts on the Sales overview"],
            ["Sent", "Waiting for their answer", "The deal moves to Quote sent"],
            ["Accepted", "The customer said yes", "The deal is marked Won at the quoted amount; Convert to sales order appears"],
            ["Rejected", "The customer said no", "The quote is locked"],
            ["Expired", "Passed its valid-until date (shown automatically)", "Change Valid until to give the customer more time"],
          ],
        },
      },
      { h: "Changing a quote" },
      {
        ul: [
          "Edit opens the same form to change the customer, lines, terms or salesperson. The quote keeps its number; if it was already sent, send it again after saving.",
          "Valid until and the terms can also be changed on the quote page, under Validity and terms.",
          "Once the customer has answered (Accepted or Rejected) the quote is locked.",
          "The bin deletes a quote that should never have existed. Prefer Rejected for a real quote the customer turned down.",
        ],
      },
      { h: "The quotes list" },
      { img: "/help/sales-quotes.webp", alt: "Quotes list with status filters, customer and deal, total, valid until and salesperson", caption: "Sales › Quotes. Filter by status; the line at the top sums what is waiting for an answer." },
      { tip: "A quote with no answer after 2-3 days needs a call, not another email. Log the call on the deal so the team knows." },
    ],
  },
  {
    slug: "sales-orders",
    section: "sales",
    title: "Sales orders and delivery",
    summary: "Convert an accepted quote, upload the PO, proforma, mark delivered and print the delivery note.",
    tags: ["sales order", "order", "convert", "po", "lpo", "proforma", "delivery", "delivery note", "mark delivered", "invoice", "files", "sales", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Step 1: convert the accepted quote" },
      {
        p: "When the customer confirms, set the quote to Accepted and press Convert to sales order on the quote page.",
      },
      { img: "/help/sales-convert.webp", alt: "Convert to an order dialog with PO number, PO date, credit terms, delivery address and notes", caption: "The lines and prices come from the quote and cannot change on the order." },
      {
        ol: [
          "Customer PO / LPO number and its date (optional, but fill them in when you have them).",
          "Credit terms: cash, 7, 15, 30 days... They set the invoice due date.",
          "Delivery address, if different from the billing address.",
          "Notes: printed on the proforma.",
          "Press Make the sales order. It gets its ZSO number.",
        ],
      },
      { h: "Step 2: the order page" },
      { img: "/help/sales-order.webp", alt: "Sales order page with total, customer PO, delivery and invoice tiles, lines and the internal panel", caption: "A sales order: total, PO, delivery and invoice at a glance, then Lines, Invoice and Files." },
      {
        table: {
          head: ["Button", "What it does"],
          rows: [
            ["Pencil", "Edit the PO number and date, credit terms, delivery address and notes"],
            ["Proforma", "Prints a proforma invoice, for customers who pay before delivery"],
            ["Mark delivered", "The goods went out: delivery date, who received them, where. The delivery note gets its ZDN number"],
            ["Delivery note", "After delivery: print it for the customer to sign"],
            ["Cancel (circle)", "Cancels the order, with a reason"],
          ],
        },
      },
      {
        ul: [
          "Files tab: upload the customer's PO and the signed delivery note with +.",
          "Inside the company only: the quoted cost and expected profit, then the supplier bills entered against this order and the real profit.",
          "The whole order goes in one delivery and gets one invoice.",
        ],
      },
      { h: "Step 3: the invoice" },
      {
        p: "Once delivered, the order shows under To invoice. The tax invoice is made by the accounts team in Accounts › To invoice; if you do not have Accounts, tell whoever handles invoices. When the invoice is issued, the deal owner gets a task to collect the money on the due date.",
      },
      { img: "/help/sales-orders.webp", alt: "Sales orders list with To deliver, To invoice, Invoiced and All filters", caption: "Sales › Sales orders: To deliver, To invoice, Invoiced or All." },
      { tip: "Upload the signed delivery note the same day. Accounts needs it to invoice, and it is your proof if the customer later says the goods never arrived." },
    ],
  },
];
