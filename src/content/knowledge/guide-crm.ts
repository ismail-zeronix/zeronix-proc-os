import type { Article } from "./types";

// Step-by-step guide to the CRM app. Screenshots in public/help/ come from a demo database with made-up companies.
const REVIEWED = "2026-10-26";

export const CRM_GUIDE: Article[] = [
  {
    slug: "crm-at-a-glance",
    section: "crm",
    title: "CRM at a glance",
    summary: "What the CRM is for, what is in its sidebar, and how to read the Overview dashboard.",
    tags: ["crm", "overview", "dashboard", "pipeline", "how to", "guide", "mine", "team", "win rate"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "The CRM holds everything that happens before the customer says yes: leads, deals, the companies they belong to and the people we talk to. Once a deal is won, the company becomes a customer in the Sales app; nothing is copied, it is the same record seen from another app.",
      },
      { h: "The sidebar" },
      {
        table: {
          head: ["Item", "What it is for"],
          rows: [
            ["Overview", "The dashboard: pipeline value, new deals, wins, win rate and what needs attention today"],
            ["Leads", "New enquiries that are not qualified yet (stages New and Contacted)"],
            ["Deals", "Qualified leads, from Qualified up to Won or Lost: the real pipeline"],
            ["Companies", "Every company we talk to, with its people, deals and history"],
            ["Contacts", "Every person at those companies, searchable by name, email, phone or company"],
          ],
        },
      },
      { h: "The Overview dashboard" },
      { img: "/help/crm-overview.webp", alt: "CRM overview dashboard with KPI tiles, pipeline by stage, lead quality and pipeline by owner", caption: "CRM › Overview. 30d / 90d / 12m changes the period; Team / Mine switches between the whole team and your own deals." },
      {
        table: {
          head: ["Tile or panel", "What it tells you"],
          rows: [
            ["Open pipeline", "Total value of every open deal, and how many there are"],
            ["New deals", "Deals created in the period, compared with the period before"],
            ["Won", "Value of the deals marked won in the period"],
            ["Win rate", "Won ÷ (won + lost) in the period, and the average days to close"],
            ["Overdue follow-ups", "Follow-up tasks past their date. Red means someone is waiting for us"],
            ["Open pipeline by stage", "Where today's open deals sit. Switch Value / Deals, or bars / table"],
            ["Lead quality", "How many open deals are Hot, Warm or Cold, from the qualification checklist"],
            ["Pipeline by owner", "Open deals and wins per salesperson"],
            ["New deals and wins", "Deals created and won per week (or month)"],
            ["Where deals come from", "Sources of new deals; the second tab shows why deals were lost"],
          ],
        },
      },
      {
        p: "Further down the page are three short lists to work from every morning: follow-ups that are overdue, open deals that have gone quiet (no activity in the last 3 days) and deals expected to close in the next two weeks.",
      },
      { h: "Who sees what" },
      {
        ul: [
          "A salesperson sees the deals they are assigned to, and everything hanging off them: quotes, orders, timeline, tasks and files.",
          "Admins and users with \"All data\" see everyone's deals. They get the Mine / All switch on the lists.",
          "A deal can have several people. The first avatar is the main owner. Only admins and \"All data\" users change who is on a deal.",
          "Companies are visible to their owners and to anyone with a deal there. If you try to add a company someone else handles, the portal says who handles it: ask an admin to share it.",
        ],
      },
      { tip: "Press Ctrl K anywhere to find a company, person, deal or quote by name. Do it before adding a new lead, so the same company is not entered twice." },
    ],
  },
  {
    slug: "crm-new-leads",
    section: "crm",
    title: "Adding and qualifying leads",
    summary: "Enter every enquiry as a lead, follow it up, and press Qualify once you know what, how many and by when.",
    tags: ["lead", "new lead", "enquiry", "qualify", "contacted", "duplicate", "source", "crm", "how to"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "Every enquiry goes into the CRM as a lead, even a two-line WhatsApp message. A lead is simply a deal at an early stage, so when it is qualified it moves to Deals with all its history: nothing is typed twice.",
      },
      { h: "Step 1: add the lead" },
      {
        ol: [
          "Open CRM › Leads and press New lead (top right). On the Deals page the same button is called New deal.",
          "Company: start typing the name. If the company is already in the portal, pick it from the list. If not, keep typing the full name and choose the emirate and industry.",
          "Contact person: pick someone already saved at that company, or type the name, job title, phone / WhatsApp and email of a new person.",
          "Deal: Product for supply (laptops, servers, accessories), Project for site work (CCTV, cabling, server rooms...). A project also asks for its type.",
          "Write what they want in their own words: models, quantity, specs, delivery date.",
          "Pick the source (WhatsApp, Website, Referral...), an estimated value in AED if you have one, and a title if the automatic one is not clear.",
          "Assigned to: you are picked already. Admins and \"All data\" users can add colleagues.",
          "Press Add deal. The portal creates the company, the person, the deal and a follow-up task for today.",
        ],
      },
      { img: "/help/crm-new-lead.webp", alt: "New deal form with company search, contact person, product or project choice, requirement, source, value and assignees", caption: "The New lead form. Typing a company name shows matching companies, so you can pick the existing one instead of making a duplicate." },
      { tip: "If the button stays disabled, read the orange line next to it: it says exactly what is missing (a company, what they want or a contact, or the project type)." },
      { h: "Step 2: work the lead" },
      { img: "/help/crm-leads.webp", alt: "Leads list with stage, Qualify button, quality, value, team and follow-up columns", caption: "CRM › Leads. Open shows every lead still in play; the New and Contacted tabs narrow the list." },
      {
        ul: [
          "Change the stage from the Stage menu in the row: New (not contacted yet) or Contacted (we spoke or messaged).",
          "Quality shows Hot, Warm or Cold from the qualification checklist on the deal (see \"The deal page\").",
          "Follow-up shows the next task date; red means it is overdue.",
          "The list icon and board icon at the top left switch between the table and a board with one column per stage. Each board column has its own + to add a lead straight into that stage.",
          "Products / Projects narrows the list to one kind of deal.",
        ],
      },
      { h: "Step 3: qualify" },
      {
        p: "Press Qualify when you know what they want, how many and by when. The lead moves to CRM › Deals at the stage Qualified and keeps its timeline, tasks and checklist. A lead that goes nowhere is moved to Lost from the Stage menu, with a reason.",
      },
    ],
  },
  {
    slug: "crm-pipeline",
    section: "crm",
    title: "Working the deals pipeline",
    summary: "The stages from Qualified to Won, the list and board views, and how to move a deal along.",
    tags: ["pipeline", "deals", "stages", "board", "kanban", "qualified", "pricing", "quote sent", "negotiation", "crm", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "The stages" },
      {
        table: {
          head: ["Stage", "Means", "Usually moves when"],
          rows: [
            ["New", "Just arrived, not contacted yet", "You call or message them"],
            ["Contacted", "We spoke or messaged them", "You press Qualify"],
            ["Qualified", "We know exactly what, how many, by when", "You start getting prices"],
            ["Pricing", "Getting prices from suppliers and making the quote", "The quote is marked Sent (automatic)"],
            ["Quote sent", "Waiting for their answer", "They come back on price, terms or delivery"],
            ["Negotiation", "Price, terms or delivery being discussed", "They confirm or say no"],
            ["Won", "Order received", "Mark as won, or the quote is marked Accepted (automatic)"],
            ["Lost", "Did not go ahead", "Pick a lost reason"],
          ],
        },
      },
      { h: "List view" },
      { img: "/help/crm-deals-list.webp", alt: "Deals list with stage tabs, kind filter, value, team, follow-up and last activity", caption: "CRM › Deals as a list. The tabs count the deals in each stage; Won and Lost show closed deals." },
      {
        ul: [
          "Open shows every deal still in play. Click a stage tab to see only that stage.",
          "The folder icon in front of a title marks a project deal.",
          "Last activity shows when someone last logged something. A deal with nothing for days is going quiet: call them.",
          "The total value of the open deals is shown at the top right.",
        ],
      },
      { h: "Board view" },
      { img: "/help/crm-deals-board.webp", alt: "Deals board with one column per stage and deal cards", caption: "The board: one column per open stage, with the count and value on top. Each card shows the company, quality, value, team, next follow-up and days in the stage." },
      {
        ul: [
          "Move a card with the small arrows menu on it (Move to...).",
          "The + at the top of a column adds a new deal straight into that stage.",
          "The number of days on a card (e.g. 4d) is how long it has been in that stage.",
        ],
      },
      { tip: "You rarely need to move a deal to Quote sent or Won by hand: marking the quote Sent or Accepted in Sales does it for you." },
    ],
  },
  {
    slug: "crm-deal-page",
    section: "crm",
    title: "The deal page",
    summary: "Everything about one deal: timeline, follow-ups, requirement, quotes, the qualification checklist and details.",
    tags: ["deal", "activity", "timeline", "follow-up", "task", "call", "whatsapp", "mention", "qualification", "hot", "warm", "cold", "checklist", "crm", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { img: "/help/crm-deal.webp", alt: "A deal page with header, activity form, timeline, follow-ups and contact card", caption: "A deal page. The header line shows the company, contact, value, owner, expected close, next follow-up, source and days in the stage." },
      { h: "The header" },
      {
        ul: [
          "Hot / Warm / Cold: the lead quality from the Qualification tab.",
          "Stage: change it here. Choosing Won or Lost opens a short dialog.",
          "Avatars: the people on the deal. Admins and \"All data\" users click them to add or remove someone.",
          "Envelope: write an email to the contact (needs the Mail app). Bin: delete the deal (owner or admin only; it removes its timeline and follow-ups).",
          "Once the deal has a project or a sales order, its number shows in the header line and opens it.",
        ],
      },
      { h: "Activity: log every call and message" },
      {
        ol: [
          "Pick the type: Call, WhatsApp, Email, Meeting or Note.",
          "Write what was said or agreed. Type @ and a name to mention a colleague; they get a notification.",
          "Optional: pick a date in Follow up on to create a follow-up task at the same time.",
          "Press Add to timeline.",
        ],
      },
      {
        p: "Stage changes, new quotes and follow-ups done are added to the timeline by themselves, so the timeline tells the whole story of the deal. Quote and order numbers mentioned in it become links.",
      },
      { h: "Follow-ups" },
      {
        p: "The Follow-ups panel on the right lists the open tasks of this deal, soonest first. The + adds one. Tick a task when it is done. A deal with no follow-up booked goes quiet, so every open deal should always have one.",
      },
      { h: "The other tabs" },
      {
        table: {
          head: ["Tab", "What you do there"],
          rows: [
            ["Chat", "Talk about the deal with the team; the messages stay with the deal"],
            ["Requirement", "What they asked for in their words: models, quantity, specs, delivery date"],
            ["Quotes", "The quotes of this deal, read only, with Make quote / Edit (product deals) or Open the BOQ (projects)"],
            ["Qualification", "The genuine-lead checklist (below)"],
            ["Details", "Title, value, expected close date, source, primary contact, and Product / Project"],
          ],
        },
      },
      { h: "Qualification: Hot, Warm or Cold" },
      { img: "/help/crm-deal-qualification.webp", alt: "Qualification checklist with Ask the customer, Check the company and Warning sign groups", caption: "Tick what you have confirmed; the label in the header updates by itself." },
      {
        table: {
          head: ["Label", "When"],
          rows: [
            ["Hot", "At least 3 of the 4 \"Ask the customer\" points, and at least 1 \"Check the company\" point"],
            ["Warm", "2 \"Ask\" points, or 1 \"Ask\" point and 2 \"Check\" points"],
            ["Cold", "Anything less"],
            ["Red flag", "\"Something feels wrong\" never lets a deal be Hot: it stays Warm at best"],
          ],
        },
      },
      { tip: "Before giving credit or a big discount, make sure the trade licence and TRN are ticked on the Qualification tab. See \"Is this lead genuine?\" in the Sales playbook." },
    ],
  },
  {
    slug: "crm-won-lost",
    section: "crm",
    title: "Winning or losing a deal",
    summary: "Mark as won turns the company into a customer; a lost reason helps win the next one.",
    tags: ["won", "mark as won", "lost", "lost reason", "customer", "trn", "billing address", "crm", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Mark as won" },
      {
        p: "When the customer confirms, choose Won in the Stage menu (on the deal page or in the list). A short dialog opens.",
      },
      { img: "/help/crm-mark-won.webp", alt: "Mark as won dialog with the company, winning quote and missing customer details", caption: "Mark as won: pick the winning quote. Missing customer details do not stop the win." },
      {
        ol: [
          "Winning quote: pick the quote the customer accepted. If there is no quote in the portal, choose \"write what was agreed\" and type the amount, their PO number and payment terms.",
          "The dialog checks the customer details. Missing ones (billing address, TRN, a contact person) are listed; the deal owner gets a follow-up task to complete them.",
          "Press Mark as won. The company now shows in Sales › Customers.",
        ],
      },
      { tip: "A tax invoice cannot be issued without a billing address and, for VAT-registered customers, a 15-digit TRN. Fill them in early, from the company page (pencil icon)." },
      {
        p: "In practice it is often quicker from the Sales side: setting the quote's status to Accepted marks the deal Won at the quoted amount by itself.",
      },
      { h: "Marking a deal lost" },
      {
        ul: [
          "Choose Lost in the Stage menu and pick why: price too high, chose another supplier, no budget, not a genuine lead, no response, could not supply the item...",
          "Add a few words under \"Tell us more\" if it helps. The reasons are counted on the CRM Overview (Where deals come from › Lost reasons).",
          "A lost deal is not deleted. If they come back, move it to another stage again.",
        ],
      },
    ],
  },
  {
    slug: "crm-companies-contacts",
    section: "crm",
    title: "Companies and contacts",
    summary: "One record per company with its people, deals and notes; how to add, edit and find them.",
    tags: ["company", "companies", "contact", "contacts", "person", "trn", "trade licence", "address", "notes", "duplicate", "crm", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { img: "/help/crm-company.webp", alt: "Company page with people, deals and notes tabs", caption: "A company page: its details on top, then People, Deals and Notes and history." },
      { h: "The company page" },
      {
        ul: [
          "New deal (top right) starts a deal for this company with the company already picked.",
          "The pencil edits the company: name, industry, emirate, website, main phone, trade licence number, TRN, billing address and where we found them.",
          "Once the company has orders, the header shows what it owes and links to its customer page in Sales.",
          "People: everyone we talk to there, with call, WhatsApp and email buttons. Add, edit or remove a person here.",
          "Deals: every deal with this company, open and closed.",
          "Notes and history: notes about the company (use @ to mention a colleague) and the activity of all its deals.",
        ],
      },
      { h: "Adding a company" },
      {
        ol: [
          "Usually you do not add a company on its own: the New lead form creates it together with the deal.",
          "To add one without a deal, open CRM › Companies and press Add company.",
          "The same company cannot be added twice: \"ABC Trading LLC\" and \"abc trading llc\" count as the same name.",
        ],
      },
      { h: "Contacts" },
      {
        p: "CRM › Contacts lists every person at every company you can see. Search by name, email, phone or company name, and call or WhatsApp them straight from the list. Tick \"decision maker\" on the person who approves the purchase: it helps on the Qualification tab.",
      },
      { tip: "Keep one company per legal entity. Branches of the same company with the same trade licence are one company; sister companies with their own licence and TRN are separate companies." },
    ],
  },
];
