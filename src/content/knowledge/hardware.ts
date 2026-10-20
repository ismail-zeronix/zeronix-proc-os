import type { Article } from "./types";

// Drafted from general industry knowledge, not from a live price list. Model numbers and generations move every few
// months: before quoting a model to a customer, check it in Procurement > Compare or on the vendor's site.
const REVIEWED = "2026-10-21";

export const HARDWARE: Article[] = [
  {
    slug: "laptops",
    section: "hardware",
    title: "Business laptops: brands and lines",
    summary: "Dell, HP, Lenovo and Apple: which line is entry, mainstream, premium or workstation.",
    tags: ["laptop", "dell", "latitude", "hp", "probook", "elitebook", "lenovo", "thinkpad", "thinkbook", "macbook"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "Corporate customers almost always buy business-grade laptops, not consumer ones. Business lines have better build quality, longer warranty options, security chips and IT management features. Knowing which line sits where lets you answer \"what is the difference between a ProBook and an EliteBook\" in one sentence.",
      },
      {
        table: {
          head: ["Brand", "Entry / value", "Mainstream", "Premium / thin-and-light", "Workstation"],
          rows: [
            ["Dell", "Latitude 3000, Dell 14/15", "Latitude 5000, Dell Pro", "Latitude 7000 / 9000, Dell Pro Premium", "Precision, Dell Pro Max"],
            ["HP", "ProBook 4 series (e.g. 440, 450)", "ProBook 6 series", "EliteBook 8 series (e.g. 840), Dragonfly", "ZBook Power / Studio / Fury"],
            ["Lenovo", "ThinkPad E, ThinkBook", "ThinkPad L", "ThinkPad T, X1 Carbon, X1 2-in-1", "ThinkPad P series"],
            ["Apple", "MacBook Air", "MacBook Air 15\"", "MacBook Pro 14\" / 16\"", "MacBook Pro (M Pro / Max)"],
          ],
        },
      },
      {
        tip: "Dell has been moving new models to the \"Dell Pro\" and \"Dell Pro Max\" names (replacing Latitude and Precision on new releases), but Latitude and Precision are still very common in stock and in customer fleets. Supplier lists will mix both.",
      },
      { h: "How to read a model name" },
      {
        ul: [
          "HP: the number is the screen class. EliteBook 840 = 14\", 860 = 16\", ProBook 440 = 14\", 450 = 15.6\". \"G11\" is the generation.",
          "Lenovo: ThinkPad T14 = 14\", L15 = 15.6\". \"Gen 5\" or \"Gen 6\" is the generation. The part number (e.g. 21xx...) identifies the exact configuration.",
          "Dell: the model family (Latitude 5440) usually encodes screen size and year. Always quote the exact configuration from the part number.",
          "Part numbers matter more than names. The same \"ThinkPad L14\" exists with different CPUs, RAM and keyboard layouts (English and Arabic SKUs are different part numbers).",
        ],
      },
      { h: "Who buys what" },
      {
        ul: [
          "Small offices and startups: ProBook, ThinkPad E/L, Latitude 3000/5000. Price-sensitive, want warranty and Windows 11 Pro.",
          "Mid and large corporates: EliteBook, ThinkPad T, Latitude 5000/7000 in fleets of 20 to hundreds. They buy on a standard model with a 3-year warranty.",
          "Executives and sales teams on the move: thin-and-light premium (EliteBook 8, X1 Carbon, Latitude 7000, MacBook).",
          "Design, engineering, architecture, video: workstation laptops (ZBook, Precision, ThinkPad P) or MacBook Pro.",
        ],
      },
    ],
  },
  {
    slug: "corporate-laptop-spec",
    section: "hardware",
    title: "What a corporate usually asks for",
    summary: "The standard laptop spec UAE companies buy, and the questions to ask before quoting.",
    tags: ["corporate", "spec", "warranty", "windows", "ram", "ssd", "vpro", "arabic keyboard", "bag", "docking"],
    reviewed: REVIEWED,
    blocks: [
      { h: "The usual \"standard build\"" },
      {
        table: {
          head: ["Item", "Typical corporate choice", "Why"],
          rows: [
            ["Screen", "14\" FHD (1920x1200 or 1920x1080)", "Best mix of size and weight. 15.6\" for finance, admin and data entry."],
            ["CPU", "Intel Core i5 / i7 or Core Ultra 5 / 7 (or Core 5 / 7), AMD Ryzen 5 / 7 PRO", "Enough for Office, browser, ERP, video calls. i3 only for the cheapest roles."],
            ["RAM", "16 GB (32 GB for power users)", "8 GB is no longer comfortable with Windows 11, Teams and a browser."],
            ["Storage", "512 GB NVMe SSD (1 TB for heavy files)", "256 GB fills up quickly and causes support calls."],
            ["OS", "Windows 11 Pro", "Needed for domain join, BitLocker and company policies. Home edition is rejected."],
            ["Warranty", "3 years, next-business-day onsite", "Fleet buyers want the vendor to come to them. Ask about 4-5 years for long-life fleets."],
            ["Security", "TPM 2.0, fingerprint reader and/or IR camera", "Required by many IT policies."],
            ["Management", "Intel vPro (Enterprise) on larger fleets", "Lets IT manage and fix machines remotely."],
            ["Keyboard", "English, or English/Arabic", "Different part numbers. Ask, because the wrong layout means a return."],
            ["Extras", "Carry bag, mouse, docking station, extra charger", "Often asked for in the same quotation."],
          ],
        },
      },
      { h: "Questions to ask before you quote" },
      {
        ol: [
          "How many units, and is it one delivery or staged?",
          "Which roles are they for (admin, finance, sales, design)? That decides the CPU and RAM.",
          "Do they have a preferred brand or an existing fleet to match?",
          "Windows 11 Pro, Linux, or macOS? Any software licences needed (Microsoft 365, antivirus)?",
          "Warranty length and type (onsite or carry-in)?",
          "Accessories, docking, bags, monitors?",
          "Delivery location, date, and payment terms (LPO, credit days, PDC)?",
          "Do they need to compare three quotes? If yes, ask what they are comparing on, so you can answer on the same points.",
        ],
      },
      {
        tip: "Windows 10 reached end of support in October 2025, so many UAE companies are still replacing old PCs. \"Is your fleet still on Windows 10?\" is a good opening question for an existing customer.",
      },
    ],
  },
  {
    slug: "workstations",
    section: "hardware",
    title: "Workstations",
    summary: "What makes a workstation different, the main families, and who needs one.",
    tags: ["workstation", "precision", "zbook", "hp z", "thinkstation", "xeon", "threadripper", "rtx", "ecc", "autocad", "revit", "render"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "A workstation is built for sustained heavy work: 3D design, engineering simulation, video editing, rendering, large data and AI work. It costs more than a normal PC because of stronger cooling, ISV-certified drivers, professional GPUs and, in the larger models, ECC memory and many CPU cores.",
      },
      {
        table: {
          head: ["Brand", "Desktop families", "Mobile workstations"],
          rows: [
            ["Dell", "Precision 3000 (entry) to 7000 (high end) towers / Dell Pro Max", "Precision 3000-7000 laptops / Dell Pro Max"],
            ["HP", "Z2 (entry), Z4, Z6, Z8 (high end)", "ZBook Power, Studio, Fury"],
            ["Lenovo", "ThinkStation P3, P5, P7, P8", "ThinkPad P series"],
          ],
        },
      },
      { h: "What goes inside" },
      {
        ul: [
          "CPU: Intel Core i7 / i9 for entry and mid; Intel Xeon W or AMD Threadripper PRO for the high end (many cores, lots of memory channels, more PCIe lanes).",
          "GPU: professional NVIDIA RTX (formerly RTX A-series, now RTX PRO) or AMD Radeon PRO. These are certified for CAD and media software. Gaming cards are not the same thing.",
          "RAM: 32 GB minimum for serious work, 64 to 128 GB or more for simulation and video. ECC memory on Xeon and Threadripper PRO catches memory errors.",
          "Storage: fast NVMe SSDs, often several drives. Large projects need space and speed.",
          "ISV certification: the vendor has tested the machine with software such as AutoCAD, Revit, SolidWorks and Adobe, so the software maker will support it.",
        ],
      },
      { h: "Who needs one" },
      {
        ul: [
          "Architects, MEP and civil consultants (Revit, AutoCAD, 3ds Max): very common in the UAE.",
          "Engineering and manufacturing (SolidWorks, ANSYS).",
          "Media and design studios (Adobe, DaVinci Resolve, 3D rendering).",
          "AI and data teams (GPU memory is the limit, not CPU).",
        ],
      },
      {
        tip: "Ask which software they run and how big the files are. The answer decides the GPU and RAM, and it is the quickest way to avoid selling too much or too little machine.",
      },
    ],
  },
  {
    slug: "servers",
    section: "hardware",
    title: "Servers",
    summary: "Rack, tower and blade basics, the main brands, processors and the options customers ask about.",
    tags: ["server", "poweredge", "proliant", "thinksystem", "supermicro", "xeon", "epyc", "raid", "nvme", "idrac", "ilo", "rack", "1u", "2u", "virtualization"],
    reviewed: REVIEWED,
    blocks: [
      {
        p: "A server runs shared services for a company: file shares, email, ERP, databases, virtual machines, backups. Reliability features (redundant power supplies, hot-swap drives, ECC memory, remote management) are what separate it from a PC.",
      },
      {
        table: {
          head: ["Brand", "Main families", "Remote management"],
          rows: [
            ["Dell", "PowerEdge T-series (tower), R-series (rack, e.g. R660 1U, R760 2U and newer R670 / R770)", "iDRAC"],
            ["HPE", "ProLiant ML (tower), DL (rack, e.g. DL360 1U, DL380 2U)", "iLO"],
            ["Lenovo", "ThinkSystem ST (tower), SR (rack, e.g. SR630, SR650)", "XClarity / XCC"],
            ["Supermicro", "Rack, tower and GPU servers, popular with integrators", "IPMI / BMC"],
          ],
        },
      },
      { h: "Form factor" },
      {
        ul: [
          "Tower: small offices, one or two servers, no rack needed. Quiet and cheap.",
          "Rack 1U / 2U: the standard for server rooms and data centres. 1U is thin and dense; 2U holds more drives and cards.",
          "Blade / high density: large data centres; rarely the first sale to an SME.",
        ],
      },
      { h: "Processors" },
      {
        ul: [
          "Intel Xeon (Scalable family; Silver, Gold and Platinum tiers on earlier generations, and the Xeon 6 family on the newest ones).",
          "AMD EPYC: very high core counts, strong for virtualisation. Often cheaper per core.",
          "Entry servers may use Xeon E-series or small EPYC / Ryzen-class parts.",
          "More cores raise price and also software licence cost for some products (for example per-core Windows Server and database licences). Ask what runs on it.",
        ],
      },
      { h: "Options customers ask about" },
      {
        ul: [
          "RAID controller and RAID level (RAID 1 for two drives, RAID 5 / 6 / 10 for more). Protects against a failed disk, it is not a backup.",
          "Drive type: SATA / SAS for capacity, NVMe SSD for speed. Hot-swap bays let them replace a drive without shutting down.",
          "Redundant power supplies (two PSUs) so one can fail.",
          "Network cards: 1 GbE is basic; 10 / 25 GbE is common for virtualisation and storage.",
          "Warranty and support: 3-year ProSupport / Foundation Care / equivalent, with 4-hour or next-business-day onsite response.",
          "Operating system and licences: Windows Server (per-core plus client access licences), VMware or Proxmox / Hyper-V for virtualisation.",
          "Backup: a server without a backup plan is an open risk. Mention it.",
        ],
      },
      {
        tip: "Ask what the server will run, how many users, and how much downtime the business can accept. Those three answers decide the size, the redundancy and the support level.",
      },
    ],
  },
  {
    slug: "processors",
    section: "hardware",
    title: "Processor cheat-sheet",
    summary: "Intel Core / Core Ultra / Xeon, AMD Ryzen / EPYC, Apple and Snapdragon in one page.",
    tags: ["cpu", "processor", "intel", "core ultra", "i5", "i7", "xeon", "amd", "ryzen", "epyc", "threadripper", "apple", "m4", "snapdragon", "suffix", "u", "h", "hx"],
    reviewed: REVIEWED,
    blocks: [
      { h: "Intel laptop and desktop" },
      {
        ul: [
          "Core i3 / i5 / i7 / i9 (12th to 14th generation, e.g. i5-1335U, i7-13700H): still very common in stock.",
          "Core Ultra 5 / 7 / 9 (Series 1 and Series 2, e.g. Ultra 7 155H, Ultra 5 225U, Ultra 7 258V): the newer family with a built-in NPU for AI features.",
          "Core 5 / 7 (without \"Ultra\", e.g. Core 7 150U): a value family. It is not the same as i5 / i7, so keep the name exactly as written on the quote.",
          "vPro: a business feature set (remote management and security) on selected Core i5 / i7 and Core Ultra parts. Corporates with IT teams ask for it.",
        ],
      },
      {
        table: {
          head: ["Suffix", "Meaning", "Typical use"],
          rows: [
            ["U", "Low power", "Thin-and-light business laptops, long battery"],
            ["P", "Mid power", "Thin laptops needing a bit more performance"],
            ["H", "High performance", "15\"/16\" laptops, creators, mobile workstations"],
            ["HX", "Highest performance", "Gaming and workstation laptops"],
            ["V", "Lunar Lake low power", "Premium thin laptops, strong battery life"],
            ["T (desktop)", "Low power desktop", "Small form factor PCs"],
            ["F / K (desktop)", "No integrated graphics / unlocked", "Needs a separate graphics card"],
          ],
        },
      },
      { h: "AMD" },
      {
        ul: [
          "Ryzen 3 / 5 / 7 / 9 for consumer and some business models. Ryzen PRO is the business version with management and security features. Ryzen AI 300-series laptops add an NPU.",
          "Ryzen Threadripper PRO: high-core-count workstation CPU.",
          "EPYC: server CPU, many cores, strong for virtualisation.",
        ],
      },
      { h: "Others" },
      {
        ul: [
          "Apple M-series (M1 to the latest generation): MacBook Air / Pro, iMac, Mac mini. Fast and efficient; runs macOS, so check software compatibility.",
          "Qualcomm Snapdragon X (Plus / Elite): Arm-based Windows laptops with long battery life. Check that the customer's business software runs on Arm.",
          "Intel Xeon: servers and workstations (Xeon W). ECC memory and more PCIe lanes.",
        ],
      },
      { h: "Quick way to talk about performance" },
      {
        ul: [
          "Office, ERP, browser, video calls: Core i5 / Core Ultra 5 / Ryzen 5 is enough.",
          "Heavy Excel, light design, many apps open: i7 / Ultra 7 / Ryzen 7 with 32 GB RAM.",
          "3D, video, simulation: workstation CPU plus a professional GPU.",
          "Higher number is not always a better laptop: battery, weight, warranty and the screen matter to the buyer too.",
        ],
      },
    ],
  },
];
