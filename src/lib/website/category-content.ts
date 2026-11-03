import type { SiteFaq } from "./types";

export interface CategoryContent {
  /** Search title (the site adds " · Zeronix Tech", so 45 characters at most) and meta description (155 at most). */
  seo: { title: string; description: string };
  intro: string;
  faq: SiteFaq[];
}

const vatFaq: SiteFaq = {
  q: "Do you deliver outside Dubai and give VAT invoices?",
  a: "Yes. We deliver to Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah and Umm Al Quwain, with a UAE VAT invoice in your company's name.",
};

/**
 * Buying advice under the product grid of each category page (Categories › "Fill empty pages"). Planned from
 * website/content/seo-research.md and keywords.csv: the answer first, UAE buying notes, links up to the guides and
 * across to industries and services, and a short FAQ. General advice only: no model claims and no prices.
 */
export const CATEGORY_CONTENT: Record<string, CategoryContent> = {
  laptops: {
    seo: {
      title: "Business Laptops in the UAE for Companies",
      description: "Business laptops for UAE companies: HP, Dell, Lenovo and Apple with local warranty, Arabic/English keyboards, VAT invoices and B2B pricing for teams.",
    },
    intro: `## Choosing business laptops for your team

For most office teams, a mid-range business laptop with 16 GB of memory, a 512 GB SSD and a full-day battery is the right standard. Pick one model per role rather than one per person: it keeps setup, spares and support simple as you hire.

Business series (such as HP EliteBook and ProBook, Dell Latitude and Lenovo ThinkPad) differ from consumer laptops in ways that matter to a company:

- **Security built in:** TPM 2.0, fingerprint or face sign-in, and BitLocker encryption with Windows 11 Pro.
- **Longer model life:** the same model stays on sale for longer, so new starters get the same machine.
- **Manageable at scale:** they can be set up remotely with Microsoft Intune or your own tools.
- **Sturdier build:** better hinges, spill-resistant keyboards and tested docks.

## Buying laptops for a company in the UAE

- **Warranty:** Middle East part numbers carry the manufacturer's local warranty. Ask before buying grey imports, which can be refused service here.
- **Keyboard:** Arabic/English is the safe default for shared or front-office machines; English-only suits most back-office teams.
- **Quantities and VAT:** we quote the full team in one go, with a VAT invoice and delivery across all seven emirates.

Not sure which model fits which role? Read our [business laptop buying guide for the UAE](/guides/business-laptops-uae-buying-guide), or see the picks for [real estate agents](/guides/best-laptops-for-real-estate-agents-uae), [law firms](/guides/laptops-for-law-firms-uae) and [accountants](/guides/best-laptops-for-accountants-uae).`,
    faq: [
      { q: "How much memory does a business laptop need in 2026?", a: "16 GB is the comfortable standard for Microsoft 365, Teams and a browser full of tabs. Choose 32 GB for heavy Excel models, development or design work." },
      {
        q: "What is the difference between a business and a consumer laptop?",
        a: "Business laptops add security chips and encryption, stay on sale for longer, are tested with docks and can be managed remotely. Consumer models are cheaper up front but harder to standardise and support across a team.",
      },
      { q: "Do you supply Arabic/English keyboards?", a: "Yes, on most business models. Tell us which users need Arabic and we quote the right part numbers." },
      vatFaq,
      { q: "Can you set the laptops up before delivery?", a: "Yes. Our IT team can install your software, join them to Microsoft 365 or your domain and hand them over ready to use." },
    ],
  },
  desktops: {
    seo: {
      title: "Business Desktops in Dubai and the UAE",
      description: "Compact and tower business desktops for UAE offices, front desks and finance teams. Local warranty, VAT invoices and B2B pricing for multiple desks.",
    },
    intro: `## When a desktop is the better choice

Desktops suit people who work at one desk all day: reception, finance, operations and call teams. For the same money they give more performance than a laptop, last longer and are harder to lose or steal.

- **Tiny or mini desktops** fit behind the monitor and keep front desks clear. They are the usual choice for receptions and clinics.
- **Small form factor (SFF)** desktops add room for an extra drive or a second graphics output.
- **Towers** suit users who need a dedicated graphics card or a lot of storage.
- **All-in-ones** keep the desk tidy where looks matter, but are harder to upgrade.

## Planning desktops for an office

Plan the screens with the PC: most finance and operations staff work faster on two monitors. Check that the desktop has the right video outputs for your monitors, and Wi-Fi if the desk has no network point.

For clinics and medical practices, read [computers for clinics in Dubai](/guides/computers-for-clinics-dubai). For a whole new office, our [office IT setup service](/services/it-consultancy-office-setup) covers the desktops, network and printers together.`,
    faq: [
      { q: "Should our office buy desktops or laptops?", a: "Desktops for people who stay at one desk all day; laptops for anyone who works from meetings, sites or home. Many offices mix both, on one standard model each." },
      { q: "How many monitors can a business desktop drive?", a: "Most current business desktops support two or three monitors from their built-in outputs. Tell us your monitors and we check the connections fit." },
      { q: "Is a mini desktop powerful enough for office work?", a: "Yes. A current mini desktop with 16 GB of memory runs Microsoft 365, ERP and browser-based systems comfortably, while using little power and desk space." },
      vatFaq,
    ],
  },
  workstations: {
    seo: {
      title: "Workstations in the UAE for CAD and 3D",
      description: "Mobile and tower workstations for Revit, AutoCAD, SolidWorks, 3D and video in the UAE. Certified graphics, local warranty and B2B pricing.",
    },
    intro: `## What makes a workstation different

A workstation is built for software that a business laptop cannot run well: CAD, BIM, 3D rendering, simulation and video. Choose one when your team uses Revit, AutoCAD, SolidWorks, 3ds Max, Enscape, V-Ray or DaVinci Resolve every day.

- **Certified graphics:** professional NVIDIA RTX cards with drivers tested by Autodesk, Dassault and other software makers (ISV certification).
- **Processor:** fast single-core speed matters most for modelling; more cores help rendering.
- **Memory:** 32 GB is the starting point for BIM; 64 GB or more for large models and rendering. ECC memory protects long calculations.
- **Cooling:** sustained performance under load, not only short bursts.

## Mobile or tower?

A **mobile workstation** suits architects and engineers who present to clients and visit sites. A **tower** gives more power for the money and is easier to upgrade, so it suits the render desk and heavy modellers. Many design offices give each designer a mobile workstation and share one tower for rendering.

Read our guide to [laptops and workstations for architects in the UAE](/guides/laptops-workstations-for-architects-uae), or see the [architecture & design](/industries/architecture-design) and [engineering & construction](/industries/engineering-construction) pages.`,
    faq: [
      { q: "Do I need a workstation for AutoCAD and Revit?", a: "For daily Revit work, yes: certified graphics and 32 GB or more of memory keep large models responsive. Light 2D AutoCAD can run on a good business laptop." },
      {
        q: "What does ISV certification mean?",
        a: "The software maker (such as Autodesk) has tested that workstation and graphics card with its program. It means fewer crashes and display problems, and support that will not blame the hardware.",
      },
      { q: "Mobile workstation or desktop tower?", a: "A mobile workstation if the user presents, travels or visits sites; a tower for the most power per dirham and easy upgrades. Many offices use both." },
      vatFaq,
    ],
  },
  servers: {
    seo: {
      title: "Business Servers in the UAE: Tower and Rack",
      description: "Tower and rack servers for UAE businesses: file sharing, ERP, virtualisation and backups. Sized, installed and supported, with local warranty.",
    },
    intro: `## Choosing a server for your business

Most small and mid-sized offices need a server for one of three jobs: shared files and user accounts, a line-of-business system (ERP, accounting or a clinic system), or several virtual machines on one box. Size it for the job and for three to five years of growth.

- **Tower servers** are quiet and need no rack, so they suit offices without a server room.
- **Rack servers** fit a cabinet with your network equipment and suit growing offices and data rooms.
- **Storage:** use RAID on business-class drives, so one failed disk does not stop the office.
- **Resilience:** redundant power supplies and remote management (such as Dell iDRAC, HP iLO or Lenovo XClarity) let us fix problems before you notice them.

## Plan the whole setup, not just the box

A server also needs a UPS, a backup that is kept off-site, and the right Windows Server licences for your users. We size these together, install the server and can look after it under an [IT AMC](/services/it-amc-support) contract. Protecting it is part of our [cybersecurity](/services/cybersecurity) work.`,
    faq: [
      {
        q: "Does a small office still need a server?",
        a: "Not always. If your files and email live in Microsoft 365, you may not. You still need one for an on-premises ERP, accounting or clinic system, large local files, or CCTV recording.",
      },
      { q: "Tower or rack server?", a: "A tower if there is no server room or cabinet; a rack server if you have, or plan, a network cabinet. Performance can be the same." },
      { q: "Do you install and support servers?", a: "Yes. We set up the server, storage, backup and user accounts, and can monitor and maintain it under an annual contract." },
      vatFaq,
    ],
  },
  monitors: {
    seo: {
      title: "Office and Business Monitors in the UAE",
      description: "Office, USB-C, ultrawide and colour-accurate monitors for UAE businesses. Single or dual-screen desks, local warranty and B2B pricing.",
    },
    intro: `## Picking monitors for the office

A second screen is one of the cheapest ways to make office staff faster. For most desks, a 24 or 27 inch IPS monitor is the right size; 27 inch QHD gives noticeably more room for spreadsheets and documents.

- **USB-C monitors** charge the laptop, carry video and connect the keyboard, mouse and network over one cable: a simple hot-desking setup without a separate dock.
- **Height and swivel adjustment** matters more than most specs for people at a desk all day.
- **Eye comfort:** look for flicker-free backlights and low blue light modes.
- **Ultrawide** screens replace two monitors for finance and trading desks.
- **Colour accuracy** (sRGB, DCI-P3 or Adobe RGB coverage, factory calibration) matters for design, photo and video teams.

## Planning many desks

Standardise on one or two models so every desk works the same, and check that your laptops or desktops have the right outputs. See [business laptops](/products/laptops) and [desktops](/products/desktops) for matching machines, and our [accountants guide](/guides/best-laptops-for-accountants-uae) for dual-screen finance setups.`,
    faq: [
      { q: "What size monitor is best for office work?", a: "24 inch Full HD suits general office work; 27 inch QHD is the comfortable step up for spreadsheets and side-by-side documents." },
      { q: "What is a USB-C monitor and do we need one?", a: "It connects a laptop with one cable that also charges it. It suits hot desks and meeting rooms, if your laptops support USB-C video and charging." },
      { q: "Which monitors suit designers?", a: "Choose IPS panels with high sRGB or DCI-P3 coverage and factory calibration; 27 inch QHD or 4K for detail work." },
      vatFaq,
    ],
  },
  accessories: {
    seo: {
      title: "Laptop Docks and Office Accessories UAE",
      description: "Docking stations, headsets, keyboards, mice and bags matched to your business laptops. Bulk office accessories with VAT invoices across the UAE.",
    },
    intro: `## Accessories that make a team standard work

The right accessories turn a laptop into a full desk setup and make video calls clearer. Buy them matched to your laptops, so everything works on day one.

- **Docking stations:** one cable to the laptop for monitors, network, charging and USB. Check the dock supports your laptops' USB-C or Thunderbolt port and the number of screens you need.
- **Headsets:** Teams- or Zoom-certified headsets cut background noise in open offices and call teams.
- **Keyboards and mice:** wireless sets for clean desks; Arabic/English keyboards where staff type both.
- **Bags and sleeves:** protect laptops for staff who travel or visit clients and sites.
- **Webcams and speakerphones:** for home offices and small meeting rooms. Larger rooms need a proper [meeting room setup](/services/av-meeting-rooms).

Order accessories with your [business laptops](/products/laptops) and [monitors](/products/monitors) and we quote the full desk as one set.`,
    faq: [
      { q: "Will any USB-C dock work with our laptops?", a: "Not always. Docks differ in power, number of screens and Thunderbolt support. Tell us your laptop models and we match a dock that is tested with them." },
      { q: "Do you supply accessories in bulk?", a: "Yes. We quote full desk kits (dock, keyboard, mouse, headset) for a whole team with one VAT invoice." },
      { q: "Which headsets work best for Microsoft Teams?", a: "Teams-certified headsets give the clearest calls and work with Teams controls. Choose wired or Bluetooth depending on whether staff also use a mobile phone." },
      vatFaq,
    ],
  },
  software: {
    seo: {
      title: "Microsoft 365 and Windows Licences UAE",
      description: "Microsoft 365, Windows 11 Pro, Office and Windows Server licences for UAE businesses, with setup, migration and a VAT invoice.",
    },
    intro: `## Business software licences, set up for you

Most companies need three things: an operating system that can be managed (Windows 11 Pro), productivity apps and email (Microsoft 365), and protection for devices and data. Buying the right licence the first time avoids paying twice.

- **Microsoft 365 Business Basic** gives email, Teams and web versions of the apps.
- **Business Standard** adds the desktop Office apps.
- **Business Premium** adds device management (Intune) and stronger security. It is the plan we suggest for most companies that handle client data.
- **Windows 11 Pro** is needed for BitLocker management, joining devices to your company and remote setup. Home editions are not built for business.
- **Windows Server and its access licences (CALs)** cover on-premises servers.

## Licensing done properly

We check how many users and devices you have, recommend the plan that fits, and set up Microsoft 365, email migration and security policies for you. For protection beyond licences, see our [cybersecurity services](/services/cybersecurity). We can look after users and licences month to month under an [IT AMC](/services/it-amc-support).`,
    faq: [
      {
        q: "Which Microsoft 365 plan should a small business choose?",
        a: "Business Standard if you only need email and the Office apps; Business Premium if you also want device management and stronger security, which suits most companies handling client data.",
      },
      { q: "Do our laptops need Windows 11 Pro?", a: "For a company, yes: Pro adds BitLocker management, joining devices to Microsoft Entra ID or a domain, and remote setup. Most business laptops ship with it." },
      { q: "Can you move our email to Microsoft 365?", a: "Yes. We migrate mailboxes and files, set up multi-factor sign-in and train staff, usually with no downtime for email." },
      { q: "Do you provide a VAT invoice for software?", a: "Yes. Licences are invoiced to your company with UAE VAT, and we keep track of renewal dates for you." },
    ],
  },
};
