/**
 * Brand pages (/brands/{brand}) and brand + category pages (/brands/{brand}/{category}, e.g. "HP business laptops"),
 * SEO audit task 4. Each pairing has its own text: the brand's business series in that category and what they suit.
 * Series names as the makers use them in 2026 (Dell renamed Latitude, OptiPlex and Precision to Dell Pro, Dell Pro
 * Desktop and Dell Pro Max in 2025; both names are given). A pairing only exists here when the brand really makes
 * that kind of product for business.
 */

export interface BrandCategory {
  /** "HP business laptops" */
  heading: string;
  series: string[];
  text: string;
}

export interface BrandSeo {
  intro: string;
  categories: Record<string, BrandCategory>;
}

export const BRAND_SEO: Record<string, BrandSeo> = {
  hp: {
    intro:
      "HP is one of the most widely used business PC brands in UAE offices. Its business range is split by role: EliteBook and ProBook laptops, EliteDesk and ProDesk desktops, Z workstations for engineering and design, and E-series and Z displays. Since buying Poly, HP also makes meeting room cameras, video bars and headsets. We supply Middle East part numbers with HP's local warranty and Care Pack upgrades.",
    categories: {
      laptops: {
        heading: "HP business laptops",
        series: ["EliteBook", "ProBook", "ZBook"],
        text: "HP's business laptops come in two main lines. EliteBook is the premium range, with lighter aluminium builds, brighter screens, stronger security (HP Wolf Security, Sure Start) and the best keyboards, for managers and people who travel. ProBook covers the same daily work at a lower price for larger teams. ZBook is HP's mobile workstation line for CAD and design. Most models ship with the Arabic and English keyboard and three-year warranty options.",
      },
      desktops: {
        heading: "HP business desktops",
        series: ["EliteDesk", "ProDesk", "Elite Mini", "EliteOne all-in-one"],
        text: "HP's office desktops are built in several sizes from the same platform: Mini PCs that mount behind a monitor, small form factor and tower models for expansion, and EliteOne and ProOne all-in-ones for reception desks. EliteDesk adds stronger security and manageability for larger IT fleets; ProDesk is the value line for everyday office desks.",
      },
      workstations: {
        heading: "HP Z workstations",
        series: ["Z2", "Z4", "Z6", "Z8", "ZBook"],
        text: "HP Z workstations are certified for Autodesk, Bentley, Dassault and Adobe software and ship with NVIDIA RTX professional graphics. The Z2 suits CAD and BIM users; the Z4, Z6 and Z8 scale to more cores, memory and multiple GPUs for rendering, simulation and AI. ZBook mobile workstations bring the same certification to laptops for engineers on site.",
      },
      monitors: {
        heading: "HP business monitors",
        series: ["E-series", "Z displays", "Series 5 and 7"],
        text: "HP's E-series monitors are the standard office choice, with height-adjustable stands and USB-C models that connect and charge a laptop over one cable. Z displays add factory colour calibration and higher resolutions for design teams. Matching HP monitors to HP laptops and docks keeps the desk setup and support simple.",
      },
      accessories: {
        heading: "HP business accessories",
        series: ["Thunderbolt and USB-C docks", "Poly headsets", "keyboards and mice"],
        text: "HP's own docks are tested with EliteBook and ProBook laptops, so monitors, network and charging connect over one cable without driver issues. Poly headsets, now part of HP, are certified for Microsoft Teams and Zoom. We bundle the right dock, headset and peripherals with each laptop on the same order.",
      },
      "video-conferencing": {
        heading: "HP Poly meeting room systems",
        series: ["Poly Studio video bars", "Poly speakerphones", "Poly cameras"],
        text: "Poly, part of HP, makes video bars, conference cameras, speakerphones and touch controllers for Microsoft Teams Rooms and Zoom Rooms. Poly Studio video bars suit huddle and small rooms, while larger kits add separate cameras and table microphones. Buying HP laptops and Poly room systems from one supplier keeps warranties and support in one place.",
      },
    },
  },
  dell: {
    intro:
      "Dell's business range is one of the broadest in the UAE, from laptops and desktops to workstations, PowerEdge servers and UltraSharp monitors. In 2025 Dell renamed its PC lines: Latitude became Dell Pro, OptiPlex became Dell Pro desktops and Precision became Dell Pro Max, so you may see both names on quotes. We supply Middle East part numbers with Dell's local warranty and ProSupport options.",
    categories: {
      laptops: {
        heading: "Dell business laptops",
        series: ["Dell Pro (Latitude)", "Dell Pro Premium", "Dell Pro Max mobile"],
        text: "Dell's business laptops, now sold as Dell Pro (formerly Latitude), cover everything from value models for large teams to the thin Pro Premium line for executives. They share Dell's docks and management tools, which makes large rollouts simple. For engineers and designers, Dell Pro Max mobile workstations (formerly Precision) add certified graphics.",
      },
      desktops: {
        heading: "Dell business desktops",
        series: ["Dell Pro desktops (OptiPlex)", "Micro", "Slim", "Tower", "All-in-One"],
        text: "Dell's office desktops, the long-running OptiPlex line now called Dell Pro, come in Micro, Slim, Tower and All-in-One sizes on the same platform, so a whole office can share one image and spare parts. They are a common choice for finance teams, call centres and reception desks that need reliable machines running all day.",
      },
      workstations: {
        heading: "Dell workstations",
        series: ["Dell Pro Max (Precision)", "tower and mobile"],
        text: "Dell Pro Max, formerly Precision, is Dell's workstation range: ISV-certified towers and mobile workstations with NVIDIA RTX professional graphics for CAD, BIM, rendering and AI. Tower models scale from a single CPU for design work to multi-GPU systems for simulation and data science.",
      },
      servers: {
        heading: "Dell PowerEdge servers",
        series: ["PowerEdge tower", "PowerEdge rack"],
        text: "Dell PowerEdge servers cover small offices to data centres: tower models such as the T-series sit in an office without a rack, while R-series rack servers fit a server room and scale for virtualisation and databases. Every PowerEdge includes iDRAC remote management, so support can reach the server even when it will not start.",
      },
      monitors: {
        heading: "Dell business monitors",
        series: ["UltraSharp", "P series", "E series"],
        text: "Dell UltraSharp monitors are a reference for colour accuracy and USB-C docking, popular with design teams and anyone who wants a one-cable desk. The P series is the everyday professional line with adjustable stands, and the E series covers budget desks. Dell's dead-pixel and advanced exchange policies make replacements quick.",
      },
      accessories: {
        heading: "Dell business accessories",
        series: ["Dell docks", "Pro keyboards and mice", "headsets"],
        text: "Dell's Thunderbolt and USB-C docks are tested with Dell Pro laptops and support firmware updates through Dell's management tools. We supply them with Dell keyboards, mice and headsets so each desk arrives complete.",
      },
    },
  },
  lenovo: {
    intro:
      "Lenovo is the world's largest PC maker and its ThinkPad laptops are a long-standing favourite with business users for their keyboards, durability and military-grade testing. The business family also includes ThinkCentre desktops, ThinkStation workstations, ThinkSystem servers and ThinkVision monitors. We supply Middle East models with Lenovo's local warranty and Premier Support upgrades.",
    categories: {
      laptops: {
        heading: "Lenovo ThinkPad business laptops",
        series: ["ThinkPad X1", "ThinkPad T", "ThinkPad L and E", "ThinkPad P"],
        text: "ThinkPad laptops are known for their keyboards, TrackPoint and durability tested against military standards. The X1 range is the premium, lightest line; the T series is the corporate workhorse; L and E series cover larger teams on tighter budgets. ThinkPad P mobile workstations add certified graphics for engineering.",
      },
      desktops: {
        heading: "Lenovo ThinkCentre desktops",
        series: ["ThinkCentre M", "ThinkCentre Tiny", "ThinkCentre neo"],
        text: "ThinkCentre desktops cover offices of every size: the M series with Tiny, small form factor and tower models for managed fleets, and the neo line for value-focused teams. ThinkCentre Tiny PCs mount behind a monitor and are a popular choice for clean desks and counters.",
      },
      workstations: {
        heading: "Lenovo ThinkStation workstations",
        series: ["ThinkStation P3", "P5", "P7", "P8", "ThinkPad P"],
        text: "ThinkStation workstations are certified for the major CAD, BIM and media applications and ship with NVIDIA RTX professional graphics. The P3 suits design and modelling; the P5, P7 and P8 scale to many cores, large memory and multiple GPUs for rendering, simulation and AI.",
      },
      servers: {
        heading: "Lenovo ThinkSystem servers",
        series: ["ThinkSystem ST tower", "ThinkSystem SR rack"],
        text: "Lenovo ThinkSystem servers include XClarity remote management, so support can check and fix them without a visit. ST tower models suit small offices and branches; SR rack servers fit server rooms for virtualisation, databases and file storage, scaling from one to multiple processors.",
      },
      monitors: {
        heading: "Lenovo ThinkVision monitors",
        series: ["ThinkVision T", "ThinkVision P", "ThinkVision E"],
        text: "ThinkVision monitors match ThinkPad and ThinkCentre desks. The T series is the mainstream office line, the P series adds colour accuracy and USB-C hubs for professionals, and the E series covers budget desks. Many USB-C models connect and charge a ThinkPad over one cable.",
      },
      accessories: {
        heading: "Lenovo business accessories",
        series: ["ThinkPad docks", "ThinkPad keyboards", "headsets and bags"],
        text: "ThinkPad docks are tested with ThinkPad laptops and managed with Lenovo's tools, and ThinkPad keyboards bring the TrackPoint to the desk. We bundle docks, headsets, mice and bags with laptops so every user's kit is complete.",
      },
    },
  },
  asus: {
    intro:
      "ASUS is best known for consumer and gaming PCs, but its business range has grown into a strong value choice: ExpertBook laptops, ExpertCenter desktops and ProArt monitors and creator PCs. ExpertBook models are light, well-specified and competitively priced for teams. We supply Middle East models with ASUS's local warranty.",
    categories: {
      laptops: {
        heading: "ASUS ExpertBook business laptops",
        series: ["ExpertBook B9", "ExpertBook B5", "ExpertBook B1 and P"],
        text: "ASUS ExpertBook laptops offer business features (TPM security, spill-resistant keyboards, durability testing) at sharp prices. The B9 is among the lightest business laptops; the B5 is the balanced mid-range; the B1 and P series suit large teams on a budget.",
      },
      desktops: {
        heading: "ASUS ExpertCenter desktops",
        series: ["ExpertCenter D", "ExpertCenter mini PCs"],
        text: "ExpertCenter desktops and mini PCs give offices a value alternative to the big three, with business warranties and manageability. Mini PCs mount behind monitors for tidy desks and counters.",
      },
      monitors: {
        heading: "ASUS business and ProArt monitors",
        series: ["ProArt", "business eye-care monitors"],
        text: "ASUS ProArt monitors are factory calibrated for colour work in design, photography and video, with wide colour gamut coverage. The business eye-care range covers everyday office desks with flicker-free panels and adjustable stands.",
      },
    },
  },
  acer: {
    intro:
      "Acer's business range focuses on value: TravelMate laptops and Veriton desktops that bring business features to budget-conscious teams, schools and large rollouts, alongside a wide choice of monitors. We supply Middle East models with Acer's local warranty.",
    categories: {
      laptops: {
        heading: "Acer TravelMate business laptops",
        series: ["TravelMate P", "TravelMate Spin"],
        text: "Acer TravelMate laptops are built for business on a budget, with durable chassis, security features and long battery life. They are a common choice for schools, field teams and companies equipping many users at once.",
      },
      desktops: {
        heading: "Acer Veriton desktops",
        series: ["Veriton X", "Veriton N mini", "Veriton all-in-one"],
        text: "Acer Veriton desktops cover tower, small form factor, mini and all-in-one sizes for offices, classrooms and counters, with business warranties at value prices.",
      },
      monitors: {
        heading: "Acer business monitors",
        series: ["Acer business monitors", "Vero"],
        text: "Acer's business monitors offer adjustable stands, eye-care features and USB-C options at value prices, suited to large office rollouts and classrooms.",
      },
    },
  },
  apple: {
    intro:
      "Apple Macs are increasingly common in UAE companies, especially in design, marketing, media and among executives. Apple silicon (the M-series chips) gives MacBooks outstanding battery life and quiet performance. We supply MacBook Air, MacBook Pro, iMac, Mac mini and Mac Studio for business with a VAT invoice, and can help with Apple Business Manager enrolment.",
    categories: {
      laptops: {
        heading: "Apple MacBook for business",
        series: ["MacBook Air", "MacBook Pro"],
        text: "MacBook Air suits most business users with all-day battery life, a light build and a silent fanless design. MacBook Pro adds more performance, memory and a better display for video, design and development work. Both can be enrolled in Apple Business Manager so IT can set them up and manage them remotely.",
      },
      desktops: {
        heading: "Apple iMac, Mac mini and Mac Studio",
        series: ["iMac", "Mac mini", "Mac Studio"],
        text: "iMac is an all-in-one for reception desks and creative teams; Mac mini is a compact desktop that drives your own monitors; Mac Studio gives editing and design teams workstation-class performance in a small box.",
      },
    },
  },
  microsoft: {
    intro:
      "Microsoft makes the Surface range of laptops and 2-in-1s, built to showcase Windows 11 and Microsoft 365, and is of course the source of the software most businesses run on. We supply Surface for Business devices and Microsoft licences, and our team can set them up with your Microsoft 365 tenant.",
    categories: {
      laptops: {
        heading: "Microsoft Surface for Business",
        series: ["Surface Laptop for Business", "Surface Pro for Business"],
        text: "Surface Laptop and Surface Pro for Business are premium Windows devices with high-resolution touchscreens, long battery life and enterprise management through Microsoft Intune. Surface Pro doubles as a tablet for people who present, sign and take notes on the move.",
      },
      accessories: {
        heading: "Microsoft Surface accessories",
        series: ["Surface docks", "keyboards and pens", "Teams-certified headsets"],
        text: "Surface docks, keyboards, pens and Microsoft's Teams-certified headsets and speakers complete a Surface setup. We bundle them with devices on the same order.",
      },
      software: {
        heading: "Microsoft software licences",
        series: ["Microsoft 365", "Windows 11 Pro", "Windows Server"],
        text: "We supply Microsoft 365 business plans, Windows 11 Pro upgrades and Windows Server licences, and can set up the tenant, users and devices for you.",
      },
    },
  },
  msi: {
    intro:
      "MSI is best known for gaming and creator hardware, and also makes business laptops and monitors. Its creator and workstation laptops pair high-end NVIDIA graphics with colour-accurate screens, useful for design and media teams. We supply Middle East models with MSI's local warranty.",
    categories: {
      laptops: {
        heading: "MSI business and creator laptops",
        series: ["Modern", "Prestige", "Creator"],
        text: "MSI Modern and Prestige laptops are light business machines for everyday office work, while the Creator range adds powerful NVIDIA graphics and calibrated screens for designers, video editors and 3D work.",
      },
      monitors: {
        heading: "MSI business monitors",
        series: ["MSI PRO monitors"],
        text: "MSI PRO monitors are business displays with eye-care features, adjustable stands and USB-C options, at value prices for office desks.",
      },
    },
  },
  nvidia: {
    intro:
      "NVIDIA makes the graphics processors inside most professional workstations: RTX professional cards (the RTX A-series and RTX Ada generation) certified for CAD, BIM, rendering and AI. We supply NVIDIA professional graphics in HP, Dell and Lenovo workstations, and as cards for upgrades, sized to your software and models.",
    categories: {
      workstations: {
        heading: "Workstations with NVIDIA RTX graphics",
        series: ["NVIDIA RTX professional GPUs in HP Z, Dell Pro Max and Lenovo ThinkStation"],
        text: "NVIDIA RTX professional graphics are what make a workstation certified for CAD and BIM: stable drivers tested with Autodesk, Bentley and Dassault software, more video memory than gaming cards, and features for rendering and AI. We configure HP Z, Dell Pro Max and Lenovo ThinkStation workstations with the RTX card that matches your models and scenes.",
      },
    },
  },
};

/** Every brand + category pairing that has its own page. */
export const BRAND_CATEGORY_PAIRS = Object.entries(BRAND_SEO).flatMap(([brand, b]) => Object.keys(b.categories).map((category) => ({ brand, category })));
