import type { SiteFaq, SiteIndustryRole } from "./types";

/**
 * Starter copy for the twelve industry pages (BRAND.md voice: plain, specific, no hype). Filled in only where a page is
 * still empty (Industries › "Fill empty pages"); every word is editable afterwards. General buying advice only: no
 * model claims, no prices, nothing that would need checking against a brand's spec sheet.
 */

export interface IndustryContent {
  heroTitle: string;
  intro: string;
  painPoints: string[];
  roles: SiteIndustryRole[];
  faq: SiteFaq[];
}

const warrantyFaq: SiteFaq = {
  q: "Do the machines come with UAE warranty?",
  a: "Yes. We supply Middle East part numbers with the manufacturer's local warranty, and can add extended or next-business-day on-site cover for most business models.",
};
const volumeFaq: SiteFaq = {
  q: "Can you supply a whole team at once?",
  a: "Yes. Tell us how many people and which roles; we quote the full set with B2B pricing, a VAT invoice and delivery across the Emirates.",
};

export const INDUSTRY_CONTENT: Record<string, IndustryContent> = {
  "real-estate": {
    heroTitle: "IT for real estate agencies in the UAE",
    intro:
      "Agents work from viewings, developer launches and the car as much as from the office. They need a laptop that is light, starts instantly and lasts the day, while the back office needs dependable desktops for the CRM, contracts and listings.\n\nWe match each role to the right business series, with Arabic/English keyboards and local warranty.",
    painPoints: ["Batteries that die between viewings", "Heavy laptops nobody wants to carry", "Slow machines when the CRM, portals and video calls run together", "No standard setup, so every new agent gets something different"],
    roles: [
      { role: "Agents and brokers", needs: "13 to 14-inch, under 1.4 kg, all-day battery, a good webcam for video viewings.", categories: ["laptops"] },
      { role: "Admin and conveyancing", needs: "Compact desktops with two monitors for contracts, the CRM and Ejari paperwork.", categories: ["desktops"] },
      { role: "Marketing and listings", needs: "A colour-accurate screen and enough memory for photo editing and video tours.", categories: ["laptops", "workstations"] },
    ],
    faq: [
      { q: "What size laptop suits an agent?", a: "Most agents are happiest with a 13 or 14-inch business laptop under about 1.4 kg with all-day battery life. Larger screens are better left to the office." },
      warrantyFaq,
      volumeFaq,
    ],
  },
  "architecture-design": {
    heroTitle: "Workstations for architects and design studios",
    intro:
      "CAD, BIM and rendering punish ordinary PCs. Studios need certified workstations with professional graphics, plenty of memory and screens that show colour accurately, plus mobile workstations for site visits and client presentations.\n\nWe size each machine to the software your team actually runs.",
    painPoints: ["Models that lag or crash as projects grow", "Renders that tie up a machine for hours", "Colours that look different on every screen", "Laptops too weak to open the model at a client meeting"],
    roles: [
      { role: "Architects and BIM modellers", needs: "Certified tower workstation, professional GPU, 32 to 64 GB memory, two calibrated monitors.", categories: ["workstations"] },
      { role: "Visualisers and render artists", needs: "The most GPU power you can budget for, fast NVMe storage and good cooling.", categories: ["workstations"] },
      { role: "Partners and site architects", needs: "Mobile workstation that opens the full model at a meeting or on site.", categories: ["workstations", "laptops"] },
    ],
    faq: [
      { q: "Do we need a certified workstation for Revit or AutoCAD?", a: "For daily professional use, yes. Certified workstations and professional GPUs are tested with these applications, which means fewer crashes and better support." },
      { q: "How much memory does a BIM workstation need?", a: "32 GB is a sensible minimum for BIM work today; large federated models and rendering benefit from 64 GB or more." },
      warrantyFaq,
    ],
  },
  "engineering-construction": {
    heroTitle: "IT for engineering and construction firms",
    intro:
      "Engineering firms run two very different worlds: design offices with heavy CAD and analysis software, and site teams who need machines that survive dust, heat and travel.\n\nWe equip both, from tower workstations to tough laptops for site offices.",
    painPoints: ["Laptops that fail in site heat and dust", "Drawings too heavy for standard office PCs", "No reliable way to share files between site and head office", "Repairs that leave engineers without a machine for days"],
    roles: [
      { role: "Design and structural engineers", needs: "Workstation with a professional GPU for CAD, BIM and analysis software.", categories: ["workstations"] },
      { role: "Site engineers and supervisors", needs: "Durable business laptop with a bright screen and good battery for site offices.", categories: ["laptops"] },
      { role: "Project office", needs: "Server for file sharing and backups between site and head office.", categories: ["servers"] },
    ],
    faq: [
      { q: "Do site teams need rugged laptops?", a: "Not always. A well-built business laptop with a bright screen and on-site warranty suits most site offices; fully rugged models make sense for outdoor or very harsh use." },
      warrantyFaq,
      volumeFaq,
    ],
  },
  legal: {
    heroTitle: "Secure business laptops for law firms",
    intro:
      "Legal work is document-heavy, confidential and often done away from the office. Firms need quiet, reliable laptops with strong security features, comfortable keyboards and long warranties.\n\nWe help you standardise one setup for partners, associates and support staff.",
    painPoints: ["Confidential files on unsecured machines", "Keyboards and screens tiring for long drafting sessions", "Mixed machines that are hard for IT to manage", "Downtime before a filing deadline"],
    roles: [
      { role: "Partners and associates", needs: "Light 14-inch business laptop, privacy screen option, fingerprint or face login.", categories: ["laptops"] },
      { role: "Paralegals and secretaries", needs: "Desktop with two monitors for drafting, reviewing and case management.", categories: ["desktops"] },
      { role: "Firm IT", needs: "A small server for document management and backups.", categories: ["servers"] },
    ],
    faq: [
      { q: "Which security features matter for a law firm?", a: "Look for a TPM chip, BitLocker-ready Windows Pro, fingerprint or face login, and an optional privacy screen for working in public." },
      warrantyFaq,
      volumeFaq,
    ],
  },
  healthcare: {
    heroTitle: "Reliable PCs for clinics and healthcare providers",
    intro:
      "Clinics depend on reception, consultation-room and imaging PCs being up all day. They need compact, quiet, reliable machines that are easy to keep clean, and secure laptops for doctors who move between rooms and branches.\n\nWe help clinics standardise on business models with local warranty.",
    painPoints: ["Reception PCs that slow down patient check-in", "Bulky towers in small consultation rooms", "Patient data on machines without proper security", "Waiting days for repairs"],
    roles: [
      { role: "Reception and billing", needs: "Compact or all-in-one desktop, fast storage, room for a second screen.", categories: ["desktops"] },
      { role: "Doctors and specialists", needs: "Secure, light laptop with good battery for moving between rooms.", categories: ["laptops"] },
      { role: "Clinic IT", needs: "A server for records, imaging storage and backups.", categories: ["servers"] },
    ],
    faq: [
      { q: "What is best for a small consultation room?", a: "A compact business desktop mounted behind the monitor, or an all-in-one, keeps the desk clear and is quiet in use." },
      warrantyFaq,
      volumeFaq,
    ],
  },
  "finance-accounting": {
    heroTitle: "IT for finance and accounting teams",
    intro:
      "Finance teams live in spreadsheets, ERP systems and several screens at once. They need desktops that handle large workbooks, dual or triple monitors, and secure laptops for remote and month-end work.\n\nWe help you set up one standard that IT can manage easily.",
    painPoints: ["Large workbooks that freeze", "Too few screens for reconciliations", "Sensitive data on unmanaged laptops", "Machines out of action at month-end"],
    roles: [
      { role: "Accountants and analysts", needs: "Desktop with 16 to 32 GB memory driving two or three monitors.", categories: ["desktops"] },
      { role: "Finance managers", needs: "Secure 14-inch business laptop for meetings and remote work.", categories: ["laptops"] },
      { role: "ERP and file server", needs: "Server sized for your ERP, with RAID and backups.", categories: ["servers"] },
    ],
    faq: [
      { q: "How many monitors does an accountant need?", a: "Two is the usual standard; analysts working across ERP, spreadsheets and email often benefit from a third." },
      warrantyFaq,
      volumeFaq,
    ],
  },
  education: {
    heroTitle: "Laptops and PCs for schools and universities",
    intro:
      "Schools and universities need durable machines in volume, with long battery life for classrooms and simple management for IT teams.\n\nWe supply business and education ranges with local warranty, for staff, labs and administration.",
    painPoints: ["Laptops that do not survive a school year", "Labs with machines of different ages and specs", "Batteries that will not last a teaching day", "Too much IT time spent setting up each device"],
    roles: [
      { role: "Teachers and lecturers", needs: "Durable laptop with all-day battery and a good webcam for hybrid lessons.", categories: ["laptops"] },
      { role: "Computer labs", needs: "Standard desktops bought as one batch, easy to image and manage.", categories: ["desktops"] },
      { role: "Administration and records", needs: "Office desktops and a server for files and backups.", categories: ["desktops", "servers"] },
    ],
    faq: [
      { q: "Can you supply a full lab in one order?", a: "Yes. We quote identical machines for the whole lab so IT can deploy one image across every desk." },
      warrantyFaq,
      volumeFaq,
    ],
  },
  hospitality: {
    heroTitle: "IT for hotels, restaurants and hospitality groups",
    intro:
      "Front desks, back offices and kitchens run on systems that must never stop. Hospitality teams need compact, dependable PCs at reception, office machines for finance and sales, and servers for property and point-of-sale systems.\n\nWe help you standardise across properties.",
    painPoints: ["Front-desk PCs that slow down check-in", "Different machines at every property", "Systems down during peak hours", "Little space behind the counter"],
    roles: [
      { role: "Front desk", needs: "Compact or all-in-one desktop, quick to start, quiet and reliable.", categories: ["desktops"] },
      { role: "Sales and revenue", needs: "Business laptop for site visits, events and client meetings.", categories: ["laptops"] },
      { role: "Property systems", needs: "Server for the property management system, files and backups.", categories: ["servers"] },
    ],
    faq: [{ q: "Can you equip several properties the same way?", a: "Yes. We quote one standard set of machines and keep the same models available as you add properties." }, warrantyFaq, volumeFaq],
  },
  "logistics-trading": {
    heroTitle: "IT for logistics and trading companies",
    intro:
      "Trading and logistics companies run on ERP, inventory and shipping systems used by office, warehouse and sales teams at once. They need reliable office PCs, laptops for the road and servers that keep stock data safe.\n\nWe help you size each part for the way your operation works.",
    painPoints: ["ERP that slows down when everyone is on it", "Warehouse PCs that fail in dust and heat", "Sales staff on old, slow laptops", "No proper backup of stock and order data"],
    roles: [
      { role: "Operations and accounts", needs: "Office desktops with two monitors for ERP and documentation.", categories: ["desktops"] },
      { role: "Sales and procurement", needs: "Light business laptop with good battery for visits and travel.", categories: ["laptops"] },
      { role: "ERP and inventory", needs: "Server sized for your ERP users, with RAID and backups.", categories: ["servers"] },
    ],
    faq: [{ q: "What server do we need for our ERP?", a: "It depends on the ERP and the number of users. Tell us both and we will size the processor, memory and storage, with room to grow." }, warrantyFaq, volumeFaq],
  },
  "media-production": {
    heroTitle: "Workstations for media and production teams",
    intro:
      "Editing, motion graphics and 3D need serious graphics power, fast storage and accurate screens. Production teams also need portable machines for shoots and client reviews.\n\nWe build each workstation around your software and your export times.",
    painPoints: ["Exports that take all night", "Timelines that stutter during playback", "Colours that do not match the final screen", "Running out of fast storage mid-project"],
    roles: [
      { role: "Editors and colourists", needs: "Workstation with a strong GPU, 64 GB memory and fast NVMe scratch storage.", categories: ["workstations"] },
      { role: "Motion and 3D artists", needs: "The fastest GPU in budget, plenty of memory, good cooling for long renders.", categories: ["workstations"] },
      { role: "Producers on set", needs: "Mobile workstation or high-end laptop for reviews and quick edits.", categories: ["workstations", "laptops"] },
    ],
    faq: [{ q: "Do editors need a professional GPU?", a: "Not always. Many editing tools run very well on high-end consumer GPUs; certified professional GPUs matter more for 3D, CAD and colour-critical work." }, warrantyFaq, volumeFaq],
  },
  retail: {
    heroTitle: "PCs for retail stores and chains",
    intro:
      "Retail needs reliable point-of-sale PCs at the counter, office machines for stock and accounts, and systems that stay the same across every branch.\n\nWe help chains standardise one setup that is easy to roll out and support.",
    painPoints: ["Tills that freeze during busy hours", "A different PC in every branch", "No space for a tower behind the counter", "Slow back-office machines for stock control"],
    roles: [
      { role: "Point of sale", needs: "Compact or all-in-one desktop that fits the counter and runs your POS software.", categories: ["desktops"] },
      { role: "Store managers", needs: "Business laptop for reports, rotas and supplier calls.", categories: ["laptops"] },
      { role: "Head office", needs: "Office desktops and a server for stock, accounts and backups.", categories: ["desktops", "servers"] },
    ],
    faq: [{ q: "Can you match our point-of-sale software?", a: "Yes. Tell us which POS system you use and we will recommend desktops that meet its requirements." }, warrantyFaq, volumeFaq],
  },
  "corporate-offices": {
    heroTitle: "Standard laptops and desktops for corporate offices",
    intro:
      "Growing companies need one standard setup: the same laptop for everyone who travels, the same desktop for everyone who does not, all managed the same way.\n\nWe help you choose the standard, then supply it consistently as you hire.",
    painPoints: ["Every new joiner gets a different machine", "IT spends hours setting up each device", "No spare when a laptop fails", "Machines bought ad hoc at retail prices"],
    roles: [
      { role: "Managers and travelling staff", needs: "Light 14-inch business laptop with docking for the office.", categories: ["laptops"] },
      { role: "Desk-based teams", needs: "Compact desktops with one or two monitors.", categories: ["desktops"] },
      { role: "Office IT", needs: "Server for files, users and backups.", categories: ["servers"] },
    ],
    faq: [{ q: "Can we keep buying the same model as we grow?", a: "Yes. We help you pick a standard from a business series with a long availability, and keep supplying it (or its direct successor) as you hire." }, warrantyFaq, volumeFaq],
  },
};
