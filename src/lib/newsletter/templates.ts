import { DEFAULT_STYLE, newBlock } from "./blocks";
import { DEFAULT_SITE, type Block, type NewsDoc, type ResolvedProduct, type TemplateDef } from "./types";

/**
 * The ready-made newsletters. Each one is a starting design (sections plus a style) that can be changed freely in the editor:
 * fonts, colours, wording, and sections added, removed or moved. The wording is a draft to read before sending; it makes no
 * promises about prices, stock or delivery times, and the key figures are only facts about the company that stay true.
 */

const QUOTE = `${DEFAULT_SITE}/quote`;

const doc = (blocks: Block[]): NewsDoc => ({ v: 1, style: { ...DEFAULT_STYLE }, blocks });

export const blankDoc = (): NewsDoc =>
  doc([newBlock("hero", { eyebrow: "", title: "Your headline", text: "A line or two that says what this email is about.", buttonLabel: "", buttonUrl: "" }), newBlock("text", { text: "Hello {name},\n\nWrite your message here." })]);

export const TEMPLATES: TemplateDef[] = [
  {
    key: "intro",
    name: "Introducing Zeronix",
    category: "Company introduction",
    group: "Introduction",
    blurb: "Who we are and what we supply: hardware, security, networking, AV and websites.",
    subject: "Introducing Zeronix: IT, security and networking for your business",
    preheader: "Hardware, CCTV, networking, meeting-room AV and websites from one UAE team.",
    doc: doc([
      newBlock("hero", { eyebrow: "Meet Zeronix", title: "One UAE team for your IT, security and networking", text: "Hardware, CCTV, networking, meeting-room AV and websites, supplied and supported by one team.", buttonLabel: "Request a quote", buttonUrl: QUOTE }),
      newBlock("stats", { lines: "1 | UAE team\n5 | Service areas\nDubai | Based in the UAE" }),
      newBlock("text", { text: "Hello {name},\n\nWe are Zeronix, a Dubai-based supplier and installer of business technology. This short note introduces what we do, so you know who to call the next time your office needs equipment or a project." }),
      newBlock("points", {
        title: "What we do",
        look: "numbers",
        lines:
          "Laptops, desktops and workstations | Business-grade hardware from leading brands, for individual users or whole teams.\nCCTV and security | Cameras, recorders and access systems, designed and installed for offices, shops and warehouses.\nNetworking and Wi-Fi | Switches, routers, firewalls and wireless coverage that stays reliable as your team grows.\nOffice IT and meeting-room AV | Displays, conferencing and everything that makes a meeting room just work.\nWebsites and software | Company websites and business software built and looked after by our own team.",
      }),
      newBlock("callout", { text: "Reply to this email with what you are looking for and we will come back with a clear, itemised quotation.", tone: "soft" }),
      newBlock("cta", { title: "Let's talk about your next project", text: "Tell us what you need and we will take it from there.", buttonLabel: "Request a quote", buttonUrl: QUOTE, tone: "accent" }),
    ]),
  },
  {
    key: "laptops",
    name: "Laptops and workstations",
    category: "Laptops & workstations",
    group: "Products",
    blurb: "Promote laptops, desktops and workstations with product cards from the website.",
    subject: "Laptops and workstations for your team",
    preheader: "Business-grade computers, supplied to your specification.",
    doc: doc([
      newBlock("hero", { eyebrow: "Computers", title: "The right laptop or workstation for every role", text: "Business-grade computers, configured for the work your team does.", buttonLabel: "Get a quotation", buttonUrl: QUOTE }),
      newBlock("text", { text: "Hello {name},\n\nWhether you are equipping one new starter or refreshing a whole office, we can supply business-grade computers configured for the work your team does." }),
      newBlock("points", {
        title: "Why choose us",
        look: "cards",
        lines: "Configured to fit | Tell us the work and the budget, and we recommend the right processor, memory and storage.\nBusiness grade | Models built for daily office use.\nOne supplier | Setup, accessories and bulk orders handled together.",
      }),
      newBlock("products", { title: "Featured computers", columns: "2", bg: "soft" }),
      newBlock("cta", { title: "Not sure which model suits?", text: "Reply with the number of users and what they do and we will suggest options.", buttonLabel: "Get a quotation", buttonUrl: QUOTE, tone: "dark" }),
    ]),
  },
  {
    key: "cctv",
    name: "CCTV and security",
    category: "CCTV & security",
    group: "Products",
    blurb: "Surveillance cameras, recorders and access control for offices, shops and sites.",
    subject: "CCTV and security systems for your premises",
    preheader: "Cameras, recorders and access control, supplied and installed.",
    doc: doc([
      newBlock("hero", { eyebrow: "Security", title: "See what matters, day and night", text: "CCTV and access control, sized to your premises and installed by our team.", buttonLabel: "Book a site survey", buttonUrl: QUOTE }),
      newBlock("text", { text: "Hello {name},\n\nA good security system starts with a proper survey of the site. We supply and install CCTV and access control sized to your premises, and explain the options in plain language." }),
      newBlock("points", {
        title: "What is included",
        look: "numbers",
        lines: "Site survey | We look at the premises, agree coverage and plan the cabling.\nCameras and recorders | Indoor and outdoor cameras with recording and remote viewing.\nAccess control | Control who enters which door, and keep a record.\nInstallation and support | Installed by our team, with support afterwards.",
      }),
      newBlock("products", { title: "Security products", columns: "2", bg: "soft" }),
      newBlock("callout", { text: "Reply with the type of premises and the number of areas to cover and we will send a first proposal.", tone: "dark" }),
      newBlock("cta", { title: "Book a site survey", text: "We will visit, advise and send a clear proposal.", buttonLabel: "Book a site survey", buttonUrl: QUOTE, tone: "accent" }),
    ]),
  },
  {
    key: "network",
    name: "Networking and Wi-Fi",
    category: "Networking & Wi-Fi",
    group: "Products",
    blurb: "Switches, routers, firewalls and Wi-Fi coverage for growing offices.",
    subject: "A faster, more reliable office network",
    preheader: "Switches, firewalls and Wi-Fi planned for how your team works.",
    doc: doc([
      newBlock("hero", { eyebrow: "Networking", title: "A network your team never has to think about", text: "Wi-Fi, switching and firewalls, planned for how your office really works.", buttonLabel: "Talk to us about your network", buttonUrl: QUOTE, tone: "accent" }),
      newBlock("text", { text: "Hello {name},\n\nSlow Wi-Fi and dropped calls cost more than they seem to. We design, supply and set up office networks that stay fast and secure as you add people and devices." }),
      newBlock("points", {
        title: "What we cover",
        look: "cards",
        lines: "Wi-Fi coverage | Access points placed for real coverage, not guesswork.\nSwitching and cabling | Structured cabling and switches sized for today and tomorrow.\nFirewall and security | Protect the office network and remote staff.",
      }),
      newBlock("products", { title: "Networking products", columns: "2", bg: "soft" }),
      newBlock("cta", { title: "What is not working today?", text: "Reply with your office size and what is slow or unreliable and we will suggest a fix.", buttonLabel: "Talk to us", buttonUrl: QUOTE, tone: "dark" }),
    ]),
  },
  {
    key: "office",
    name: "Office IT and meeting-room AV",
    category: "Office IT & AV",
    group: "Products",
    blurb: "Displays, conferencing and equipment that make meeting rooms and offices work.",
    subject: "Meeting rooms and offices that just work",
    preheader: "Displays, conferencing and office IT, supplied and set up.",
    doc: doc([
      newBlock("hero", { eyebrow: "Office IT and AV", title: "Meeting rooms that start on time", text: "One screen, one camera and one cable should be enough to start a meeting.", buttonLabel: "Plan my meeting room", buttonUrl: QUOTE, tone: "light" }),
      newBlock("text", { text: "Hello {name},\n\nWe supply and set up meeting-room technology and everyday office IT so your team can get on with the work." }),
      newBlock("points", {
        title: "What we set up",
        look: "bar",
        lines: "Meeting-room setups | Display, camera, microphone and speaker working together.\nOffice equipment | Printers, monitors, docking stations and accessories.\nSetup and handover | Installed, tested and explained to your team.",
      }),
      newBlock("products", { title: "Office and AV products", columns: "2", bg: "soft" }),
      newBlock("cta", { title: "Plan your meeting room", text: "Reply with the room size and how many people use it and we will suggest a setup.", buttonLabel: "Plan my meeting room", buttonUrl: QUOTE, tone: "accent" }),
    ]),
  },
  {
    key: "web",
    name: "Websites and software",
    category: "Websites & software",
    group: "Services",
    blurb: "Company websites and business software built by the Zeronix team.",
    subject: "A website and software built around your business",
    preheader: "Company websites and business tools, built and supported by our own team.",
    doc: doc([
      newBlock("hero", { eyebrow: "Websites and software", title: "Your business online, built properly", text: "Company websites, online shops and business software from our own team.", buttonLabel: "Discuss your project", buttonUrl: QUOTE }),
      newBlock("text", { text: "Hello {name},\n\nBesides hardware, our team builds company websites and business software. If your website is out of date, or your team still runs on spreadsheets, we can help." }),
      newBlock("points", {
        title: "What we build",
        look: "cards",
        lines: "Company websites | Fast, mobile-friendly sites that explain what you do and bring in enquiries.\nOnline shops | Catalogue, ordering and payments for selling online.\nBusiness software | Tools for quotes, orders, invoices and customers shaped around how you work.",
      }),
      newBlock("cta", { title: "Tell us about your project", text: "Reply with a few lines about what you need and we will arrange a short call.", buttonLabel: "Discuss your project", buttonUrl: QUOTE, tone: "accent" }),
    ]),
  },
  {
    key: "offer",
    name: "Special offer / new arrivals",
    category: "Offer & new arrivals",
    group: "Offers",
    blurb: "Put a time-limited offer or newly arrived products up front.",
    subject: "New arrivals and offers from Zeronix",
    preheader: "Fresh stock and offers for your business.",
    doc: doc([
      newBlock("hero", { eyebrow: "New arrivals", title: "Fresh stock for your business", text: "Prices change with the market, so ask for a current quotation.", buttonLabel: "Ask for today's price", buttonUrl: QUOTE, tone: "accent", align: "center" }),
      newBlock("callout", { text: "", tone: "dark" }),
      newBlock("text", { text: "Hello {name},\n\nHere are some products we are supplying right now. Need something that is not shown? Reply with the model or specification and we will check availability." }),
      newBlock("products", { title: "Featured products", columns: "3", bg: "soft" }),
      newBlock("cta", { title: "Ask for today's price", text: "We reply with a clear, itemised quotation.", buttonLabel: "Ask for today's price", buttonUrl: QUOTE, tone: "dark" }),
    ]),
  },
  {
    key: "monthly",
    name: "Monthly update",
    category: "Monthly update",
    group: "Updates",
    blurb: "A regular news email: three short updates and a few products.",
    subject: "Zeronix monthly update",
    preheader: "What is new this month at Zeronix.",
    doc: doc([
      newBlock("hero", { eyebrow: "Monthly update", title: "What is new this month", text: "A short update from the Zeronix team.", buttonLabel: "", buttonUrl: "", tone: "light" }),
      newBlock("points", {
        title: "This month",
        look: "numbers",
        lines: "First update | Write one or two lines here.\nSecond update | Write one or two lines here.\nThird update | Write one or two lines here.",
      }),
      newBlock("products", { title: "Worth a look", columns: "2", bg: "soft" }),
      newBlock("cta", { title: "Thank you for reading", text: "Questions or something you need? Just reply to this email.", buttonLabel: "Get in touch", buttonUrl: QUOTE, tone: "dark" }),
    ]),
  },
];

export const templateByKey = (key: string): TemplateDef | undefined => TEMPLATES.find((t) => t.key === key);

/** Kinds of newsletter besides the ready-made templates. */
export const BLANK_KEY = "blank";
export const HTML_KEY = "html";
export const templateName = (key: string): string => (key === HTML_KEY ? "Pasted HTML code" : key === BLANK_KEY ? "Blank design" : (templateByKey(key)?.name ?? key));

/** Stand-in products so the gallery shows what a product section looks like before real products are picked. */
export const SAMPLE_PRODUCTS: ResolvedProduct[] = [1, 2, 3, 4].map((n) => ({ id: -n, name: `Product name ${n}`, brand: "Brand", url: DEFAULT_SITE, image: null, price: null }));
export const withSamples = (d: NewsDoc): NewsDoc => ({ ...d, blocks: d.blocks.map((b) => (b.type === "products" && !b.ids?.length ? { ...b, ids: SAMPLE_PRODUCTS.slice(0, b.p.columns === "3" ? 3 : 4).map((p) => p.id) } : b)) });
