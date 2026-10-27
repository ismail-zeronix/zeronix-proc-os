import type { Article } from "./types";

// Step-by-step guide to the Projects app. Screenshots in public/help/ come from a demo database with made-up companies.
const REVIEWED = "2026-10-26";

export const PROJECTS_GUIDE: Article[] = [
  {
    slug: "projects-at-a-glance",
    section: "projects",
    title: "Projects at a glance",
    summary: "What counts as a project, how it follows its deal from lead to handover, and the Projects overview and list.",
    tags: ["projects", "project", "overview", "phase", "site work", "cctv", "cabling", "server room", "zpj", "how to", "guide"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "A project is site work: CCTV, network cabling, server rooms, access control, AV and meeting rooms, office IT setups, software. In the portal a project is a CRM deal of the kind Project, with a project record (ZPJ-year-number) beside it. Customer, contact, value and team come from the deal, so they are never typed twice.",
      },
      { h: "From lead to handover" },
      {
        table: {
          head: ["Phase", "What is happening", "Where you work"],
          rows: [
            ["Leads", "The deal is new, contacted, qualified or being priced", "CRM deal, then the BOQ"],
            ["Quoted", "The quote has gone to the customer", "Proposal and quote"],
            ["To start", "Won, work not begun", "Site & plan, Tasks"],
            ["In progress", "Work on site (or on hold)", "Tasks"],
            ["Completed", "Work finished and handed over", "Sales order, invoice"],
            ["Lost / cancelled", "The deal was lost, or the project stopped after it was won", "-"],
          ],
        },
      },
      {
        p: "While the deal is open, the project shows the deal's stage. Once the deal is won, the project gets its own work status: Not started, In progress, On hold, Completed, Closed (signed off and paid) or Cancelled.",
      },
      { h: "The Projects overview" },
      { img: "/help/projects-overview.webp", alt: "Projects overview with in progress, project leads, won this month and completed tiles, projects by phase and by type", caption: "Projects › Overview: this month compared with last month, by phase, by type, and what needs attention." },
      {
        p: "Needs attention lists won projects with an overdue task or no start date yet.",
      },
      { h: "The projects list" },
      { img: "/help/projects-list.webp", alt: "Projects list grouped by phase with type, value, team and dates", caption: "Projects › Projects, grouped by phase. The board icon shows one column per phase; the type filter narrows to CCTV, networking..." },
    ],
  },
  {
    slug: "projects-start",
    section: "projects",
    title: "Starting a project",
    summary: "Make a project deal in the CRM, or turn an existing deal into a project; what the portal sets up for you.",
    tags: ["project", "new project", "project type", "kind", "product", "deal", "checklist", "boq sections", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "A new enquiry for site work" },
      {
        ol: [
          "CRM › Leads › New lead (or + in the Projects list).",
          "Fill in the company and contact as for any lead.",
          "In the Deal part, switch Product to Project and pick the project type: CCTV, Networking & cabling, Server room, Access control, AV & meeting rooms, Office IT setup, Software & websites, or Other.",
          "Describe the work: what, how much, which site. For example: 16 IP cameras for a 2-floor warehouse, NVR with 30 days recording, site in Al Quoz.",
          "Press Add deal.",
        ],
      },
      { h: "An existing deal turns out to be a project" },
      {
        p: "Open the deal in the CRM › Details tab › Kind of deal › Project, pick the type and save. The project is created there and then.",
      },
      { h: "What the portal sets up" },
      {
        ul: [
          "A project number (ZPJ-year-number), linked from the deal header.",
          "The BOQ sections of that project type (for CCTV: Cameras & recording, Cabling & accessories, Installation, Testing & commissioning). You can rename, add or remove them.",
          "The checklist of that project type in three groups: Survey & proposal, Work on site, Handover.",
          "The project manager is the deal owner until you pick someone else.",
        ],
      },
      { tip: "Admins edit the project types, their default BOQ sections and starting checklists in Admin › Settings › Projects." },
    ],
  },
  {
    slug: "projects-boq",
    section: "projects",
    title: "Pricing a project: the BOQ",
    summary: "Sections, kinds of line, units, cost and margin, optional extras, and Make quote from the BOQ.",
    tags: ["boq", "bill of quantities", "section", "labour", "material", "service", "lump sum", "optional", "margin", "make quote", "update quote", "projects", "how to"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "Projects are not priced like product deals. Each project has a BOQ (bill of quantities) on its BOQ tab: the work in sections, each line with its kind, quantity, unit, our cost, margin and price. The quote is made from the BOQ.",
      },
      { img: "/help/project-boq.webp", alt: "BOQ tab with sections, lines with kind, quantity, unit, cost, margin, price and total, and the Make quote button", caption: "The BOQ tab. Each section shows its selling total, our cost and the margin." },
      { h: "Adding lines" },
      {
        ol: [
          "Type the description in the empty row at the bottom of a section (\"Add a line to ...\").",
          "Pick the kind, the quantity and the unit (nos, m, box, pts, lot, day...).",
          "Type the cost and margin, or the price. Press Enter or + to add the line.",
          "Typed boxes save by themselves when you leave them.",
          "The magnifier on a section opens Find price to add a supplier's material at its cost.",
        ],
      },
      {
        table: {
          head: ["Kind", "Use it for"],
          rows: [
            ["Material", "Something we buy and supply (Find price works here)"],
            ["Labour", "Our technicians' time: installation, cabling, programming"],
            ["Service", "Testing, commissioning, training, support, survey"],
            ["Lump sum", "One price for a whole piece of work"],
          ],
        },
      },
      { h: "Sections, margins and extras" },
      {
        ul: [
          "Add section creates a new group (for example \"Alarm system\"). The ... menu of a section renames it, sets one margin for all its lines, or removes it once it is empty.",
          "OPT on a line makes it an optional extra: shown to the customer as an option, left out of the total and out of the quote. Click it again to include it.",
          "The ... menu of a line moves or removes it.",
          "Subtotal, VAT and total are at the bottom, with our profit for the team only.",
        ],
      },
      { h: "Make quote" },
      {
        ol: [
          "When the BOQ is ready, press Make quote. The quote gets a ZQ number and keeps the sections and units; optional extras stay out.",
          "Changed the BOQ after that? The button becomes Update ZQ-...: it rewrites the open quote with the same number. Send it to the customer again after.",
          "Once the customer accepts the quote, the BOQ shows a lock note: changes no longer reach the customer.",
          "The quote is then sent, accepted and converted to a sales order in Sales, like any other quote.",
        ],
      },
      { tip: "Price labour honestly: count the days for cable pulling, mounting, programming and testing, and add a day for snags. Projects lose money on labour, not on materials." },
    ],
  },
  {
    slug: "projects-proposal",
    section: "projects",
    title: "Writing the proposal",
    summary: "The proposal editor: standard proposal or template, blocks, outline, autosave, print and PDF, and how it travels with the quote.",
    tags: ["proposal", "editor", "blocks", "cover", "scope", "payment schedule", "timeline", "terms", "template", "pdf", "print", "projects", "how to"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "The proposal is the document the customer receives for a project: a cover page, our understanding of the job, the scope, the price from the BOQ, the payment schedule, the timeline and the terms. Open it from the project's Proposal tab.",
      },
      { h: "Starting" },
      { img: "/help/project-proposal-start.webp", alt: "Proposal start page with Standard proposal and saved templates", caption: "Pick a starting point: the standard proposal set up for the project type, or a template saved earlier." },
      { h: "The editor" },
      { img: "/help/project-proposal.webp", alt: "Proposal editor with the outline on the left and the dark cover page on the right", caption: "The outline on the left lists every block; the page on the right is the proposal as it will print." },
      {
        ul: [
          "Click in the page to edit text. Bold, lists, links, alignment and a highlighted note are in the text toolbar.",
          "Add a block with + Block at the top, the + between blocks, or by typing / in an empty text.",
          "Drag blocks in the outline to reorder them.",
          "Changes save by themselves a second after you stop typing (\"Saved\" at the top). If a colleague saved a newer version, the portal refuses to overwrite it and tells you.",
          "Print preview and Download PDF show the working draft.",
          "Templates: start again from the standard proposal or a template, or save this proposal as a template for the project type.",
        ],
      },
      {
        table: {
          head: ["Block", "What it is"],
          rows: [
            ["Cover page", "Dark full-page cover: logo, title, customer, reference, validity"],
            ["Quotation header", "Our details, quotation number, date, valid until, customer"],
            ["Heading / Text / Table", "Numbered section titles, paragraphs and lists, grids"],
            ["Price (BOQ)", "The BOQ of this project, always up to date: every item or section totals, optional extras"],
            ["Payment schedule", "Advance, progress and final payments as shares of the total with VAT"],
            ["Bank details", "Our bank account for the payments"],
            ["Timeline", "Phases and how long each takes"],
            ["Terms", "Warranty, exclusions, conditions, from the standard texts and a shared library"],
            ["Signatures", "Our signature and stamp, and the customer's acceptance"],
            ["Divider / Page break", "A thin line, or a new page when printed"],
          ],
        },
      },
      { h: "Proposal and quote" },
      {
        ul: [
          "Make quote (or Update ZQ-...) is also on the proposal toolbar. It freezes a copy of the proposal with the quote.",
          "The quote's print, PDF and email then use that frozen copy, so what the customer received never changes afterwards.",
          "Project quotes are valid 14 days and carry the project terms.",
        ],
      },
      { tip: "Write the Exclusions block carefully (civil work, core drilling, power points, permits). Most site disputes come from something the customer assumed was included." },
    ],
  },
  {
    slug: "projects-site-tasks",
    section: "projects",
    title: "Running the work: site, tasks and status",
    summary: "Site & plan, the project checklist, required tasks, and moving the work status to Completed.",
    tags: ["site", "site address", "start date", "target", "project manager", "checklist", "tasks", "required", "status", "in progress", "on hold", "completed", "handover", "projects", "how to"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Site & plan" },
      { img: "/help/project-site.webp", alt: "Project page with value, work status, tasks and target completion tiles, and the Site & plan tab", caption: "The project page. The four tiles show the value, the stage or work status, task progress and the target completion date." },
      {
        ul: [
          "Site address and a map link, so the team finds the site.",
          "Start date and target completion. Work and handover task dates follow the start date.",
          "Project manager: who runs the site work.",
          "Site notes: access times, parking, security pass, who to call on site.",
        ],
      },
      { h: "The checklist (Tasks tab)" },
      { img: "/help/project-tasks.webp", alt: "Project checklist with Survey & proposal, Work on site and Handover groups", caption: "The checklist in three groups. Overdue dates are red; the shield marks a required task." },
      {
        ul: [
          "Tick a task when it is done. The whole project team can tick, add, reorder and reassign tasks.",
          "Survey dates count from the day the project was opened; work and handover dates from the start date. A date you pick by hand stays.",
          "The shield makes a task required: it must be done before the project can be Completed.",
          "\"Add a task\" at the bottom of each group adds your own task.",
          "Checklist tasks also show in the Tasks app and on Home, linked to the project.",
        ],
      },
      { h: "Work status" },
      {
        table: {
          head: ["Status", "Means"],
          rows: [
            ["Not started", "Won, work not begun"],
            ["In progress", "Work on site"],
            ["On hold", "Waiting for the customer, material or site access"],
            ["Completed", "Work finished, handover done. Refused while required tasks are open (an admin can override)"],
            ["Closed", "Signed off and paid"],
            ["Cancelled", "Stopped after it was won. The deal stays won; cancel its order separately if needed"],
          ],
        },
      },
      { h: "The other tabs" },
      {
        ul: [
          "Quotes & orders: the project's quotes and its sales order.",
          "Chat: talk about the project with the team.",
          "Activity: calls, meetings and status changes, as on the deal.",
          "The right side shows the customer with call and WhatsApp buttons, the site and what the customer asked for.",
        ],
      },
      { tip: "Take photos before closing ceilings and after every rack is dressed, and keep them in Files. They answer most questions at handover." },
    ],
  },
];
