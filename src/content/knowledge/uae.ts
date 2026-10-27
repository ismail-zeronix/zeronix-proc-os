import type { Article } from "./types";

const REVIEWED = "2026-10-21";

export const UAE: Article[] = [
  {
    slug: "finding-customers-uae",
    section: "uae",
    title: "Finding customers in the UAE",
    summary: "Where to look for companies that buy laptops, workstations and servers, and how to start the conversation.",
    tags: ["customers", "leads", "prospecting", "free zone", "chamber", "directory", "exhibition", "gitex", "linkedin", "referral", "tender", "supplier registration"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Who needs IT hardware" },
      {
        ul: [
          "New and growing companies: every new office needs laptops, a network and often a server or cloud setup.",
          "Professional firms: accounting and audit, law, consulting, recruitment, real-estate brokerages, insurance agencies.",
          "Contracting and consulting: architecture, MEP, civil and construction firms need workstations.",
          "Schools, clinics, hospitals, hotels, logistics and trading companies: regular fleet refresh.",
          "IT integrators, CCTV and telecom installers: they buy for their own customers and want a reliable supplier.",
          "Government and semi-government bodies: through supplier registration and tenders.",
        ],
      },
      { h: "Where to find them" },
      {
        ul: [
          "Free zone announcements: free zones publish newly licensed companies. See the next article for how to use these (for example the Meydan Free Zone announcements page).",
          "Chamber of Commerce directories (Dubai, Abu Dhabi, Sharjah and others) list member companies by activity.",
          "LinkedIn: search by company size, location and role (IT manager, procurement, operations). Follow up with a short, relevant message.",
          "Exhibitions and conferences: GITEX, and trade shows for construction, health, security, logistics and education. Visitors and exhibitors are buyers or influencers.",
          "Business parks and office towers: Business Bay, JLT, Sheikh Zayed Road, Al Quoz and industrial areas have many small and mid-size firms.",
          "Referrals: ask every happy customer, \"Who else do you know who might need this?\"",
          "Supplier-registration pages of large groups, banks, hospitals and schools: apply to be on their vendor list.",
          "Government tender portals (federal and emirate level): watch for IT supply tenders that match what you can deliver.",
        ],
      },
      { h: "First contact that works" },
      {
        ol: [
          "Find the right person: IT manager, procurement or the owner in a small company.",
          "Use a relevant first line: \"Congratulations on your new licence. We supply business laptops and servers to new offices in the UAE.\"",
          "Offer something concrete: a quotation for a standard setup, or a short checklist of what a new office needs.",
          "Ask for a short call, not an order.",
          "Log the lead with its source so you know which channels work.",
        ],
      },
      { tip: "Pick one channel each week and work it properly, instead of touching ten channels lightly." },
    ],
  },
  {
    slug: "new-licences",
    section: "uae",
    title: "Spotting newly opened businesses",
    summary: "Using free-zone licence announcements as a lead source today, and the plan to automate it later.",
    tags: ["meydan", "licence", "license", "free zone", "announcements", "new business", "startup", "dmcc", "ifza", "rakez", "automation", "prospecting"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "A company that has just been licensed is setting up an office, buying equipment and choosing suppliers. That makes it one of the best times to contact them. Several free zones publish lists of newly licensed companies. For example, the Meydan Free Zone publishes its announcements at announcements.meydanfz.ae, with company names and licence dates.",
      },
      { h: "How to use it today (manual)" },
      {
        ol: [
          "Open the announcements page once a week and note new companies in your target activities.",
          "Search the company name: website, LinkedIn page, phone and a business email shown publicly.",
          "Add it as a lead with the source \"Meydan announcement\" (or the free zone's name) and the licence date.",
          "Make a first contact within a few days of the licence date: call, or a short email.",
          "Offer what a new office needs: laptops and desktops, a server or storage, networking, and a website if they do not have one.",
        ],
      },
      { h: "Other sources of the same kind" },
      {
        ul: [
          "Other free zones publish or share new-company information in different ways: DMCC, IFZA, RAKEZ, SHAMS, Dubai Silicon Oasis, Abu Dhabi's ADGM, and more. Check each one's website.",
          "Mainland licences come from the emirate's economic department. New licences are sometimes announced in business news and on social media.",
        ],
      },
      { h: "Planned: Prospecting app" },
      {
        p: "Later we plan an app that collects these announcements automatically, lists new companies by date and activity, finds their public business contact details, and lets the team turn a prospect into a lead in one click. It could also support email campaigns offering equipment and our website and software services.",
      },
      { h: "Rules to follow before automating or sending cold email" },
      {
        ul: [
          "Check the website's terms and robots rules before collecting data automatically, and ask permission if in doubt.",
          "Collect business contact details only (company emails and phones that the company publishes), not personal data.",
          "Every campaign email must say who we are, why we are writing, and how to opt out. Keep a list of people who opted out and never email them again.",
          "UAE data-protection (PDPL) and telecom regulator (TDRA) rules apply to marketing messages. Get proper advice before large-scale cold email.",
          "Send in small batches from a proper company mailbox so that our email domain keeps a good reputation.",
        ],
      },
    ],
  },
];
