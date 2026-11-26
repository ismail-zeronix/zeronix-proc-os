/**
 * Buying copy for the main category pages (SEO audit 2026-11-25, tasks 3 and 4): a ~150-word intro shown above the
 * products, the specs worth comparing, the labels of the comparison table (the three key specs every product card
 * carries, in the category's spec-template order) and questions. The portal's own category intro and FAQ (Website ›
 * Categories) still show below the products; questions here are added when the editor has not asked the same one.
 * Keep promises to what the site already says elsewhere: B2B pricing, VAT invoice, UAE delivery, local warranty.
 */

export interface Qa {
  q: string;
  a: string;
}

export interface CategorySeo {
  /** Search title without the " · Zeronix Tech" the layout adds (45 characters at most). */
  title: string;
  /** Under 155 characters. */
  description: string;
  /** Above the product list, about 150 words, plain paragraphs. */
  lead: string[];
  compare: { name: string; why: string }[];
  /** Labels for the product cards' three key specs, in order. */
  table: [string, string, string];
  faq: Qa[];
  /** Brands we quote in this category, shown as text (linked when the brand has a page). */
  brands: string[];
}

/** The meeting-room family: the parent and its six kinds, in menu order. */
export const VC_PARENT = "video-conferencing";
export const VC_SUBS = ["conference-cameras", "conference-audio", "room-kits", "wireless-presentation", "meeting-room-displays", "room-control-panels"] as const;
/** Names as the portal creates them (meeting-room starter); links work before the API is asked. */
export const VC_NAMES: Record<string, string> = {
  "video-conferencing": "Video conferencing and meeting rooms",
  "conference-cameras": "Conference cameras",
  "conference-audio": "Speakerphones and conference audio",
  "room-kits": "All-in-one room kits",
  "wireless-presentation": "Wireless presentation and BYOD",
  "meeting-room-displays": "Meeting room displays",
  "room-control-panels": "Room control panels",
};
export const isVc = (slug: string) => slug === VC_PARENT || (VC_SUBS as readonly string[]).includes(slug);

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  laptops: {
    title: "Business laptops in Dubai, UAE",
    description: "HP EliteBook, Lenovo ThinkPad and Dell Pro business laptops in Dubai with Middle East part numbers, VAT invoice and B2B pricing for teams.",
    lead: [
      "A business laptop is bought for three to five years of daily use, so the deciding points are not the same as for a home machine. Look for a business series (HP EliteBook and ProBook, Lenovo ThinkPad, Dell Pro and Latitude, ASUS ExpertBook) rather than a consumer model: they keep the same parts for longer, have spill-resistant keyboards, TPM security chips, and docking and repair options that IT teams rely on.",
      "For most office staff, an Intel Core Ultra 5 or AMD Ryzen 5 with 16 GB of memory and a 512 GB SSD is the comfortable baseline today. Sales and field teams should weigh battery life and weight; finance and analysts benefit from 32 GB and a sharper screen. We supply Middle East part numbers with the Arabic and English keyboard and local warranty, and quote the whole team on one VAT invoice.",
    ],
    compare: [
      { name: "Processor", why: "Core Ultra 5/7 or Ryzen 5/7 for office work; the higher tier for heavy spreadsheets and video calls all day." },
      { name: "Memory", why: "16 GB is the floor for Microsoft 365 and Teams; 32 GB if people keep many apps open or run analytics." },
      { name: "Storage", why: "512 GB SSD suits most staff; choose 1 TB for large local files or offline work." },
      { name: "Weight and battery", why: "Under 1.4 kg and a full working day on battery matter for people who travel or work on site." },
      { name: "Warranty", why: "Three years with next-business-day on-site service keeps downtime short." },
    ],
    table: ["Processor", "Memory", "Storage"],
    faq: [
      { q: "Which business laptop is best for office staff in the UAE?", a: "For general office work a Core Ultra 5 or Ryzen 5 laptop with 16 GB and a 512 GB SSD, from a business series such as EliteBook, ThinkPad or Dell Pro, gives the best mix of speed, battery and lifespan." },
      { q: "Do your laptops come with an Arabic keyboard?", a: "Middle East part numbers ship with the Arabic and English keyboard. Tell us if you need English only and we will quote that part number." },
      { q: "Is the warranty valid in the UAE?", a: "Yes. We supply Middle East models with the manufacturer's local warranty, and can add extended or on-site cover for most business series." },
      { q: "Can you give a price for 10 or more laptops?", a: "Yes. Send the model or tell us the roles and team size, and we reply with B2B pricing and a VAT invoice for the whole order." },
      { q: "Should we choose Windows 11 Pro or Home?", a: "Pro. It adds BitLocker encryption, domain and Entra ID join and the management tools businesses need; all business series ship with it." },
      { q: "Can you set the laptops up before delivery?", a: "Our IT services team can install your software, join them to your Microsoft 365 or domain and hand them over ready to use." },
    ],
    brands: ["HP", "Lenovo", "Dell", "ASUS", "Acer", "Apple", "Microsoft", "MSI"],
  },
  desktops: {
    title: "Business desktops in Dubai, UAE",
    description: "HP EliteDesk, Lenovo ThinkCentre and Dell desktops for UAE offices: compact, tower and all-in-one PCs with VAT invoice and B2B pricing.",
    lead: [
      "Desktops are still the most cost-effective choice for fixed desks: reception, accounts, call centres, design offices and shared machines. The main decision is the size. Mini PCs mount behind a monitor and save space; small form factor towers take a graphics card or extra drives; full towers suit heavier work; all-in-ones keep counters and front desks tidy.",
      "For everyday office use, a Core i5 or Core Ultra 5 with 16 GB of memory and a 512 GB SSD is the sensible standard, with 32 GB for finance teams who work with large files. Business lines such as HP EliteDesk and ProDesk, Lenovo ThinkCentre and Dell Pro desktops (formerly OptiPlex) are built to run all day and are easy to service. We quote complete desks, with monitors, keyboards and Microsoft licences, on one VAT invoice.",
    ],
    compare: [
      { name: "Form factor", why: "Mini for small desks and counters, small form factor for most offices, tower when you need expansion." },
      { name: "Processor", why: "Core i5 or Core Ultra 5 for office work; Core i7 for heavy spreadsheets and light design." },
      { name: "Memory", why: "16 GB as standard, 32 GB for finance and analysis; check it can be upgraded later." },
      { name: "Display outputs", why: "Two or three outputs if staff use dual monitors." },
      { name: "Warranty", why: "Three years on-site is common on business models and saves IT time." },
    ],
    table: ["Processor", "Memory", "Storage"],
    faq: [
      { q: "Mini PC or tower: which should we choose?", a: "A mini PC is enough for office software and saves desk space. Choose a small form factor or tower if you need a graphics card, more drives or more ports." },
      { q: "Can one desktop run two monitors?", a: "Yes. Business desktops have two or three display outputs. Tell us the monitors and we include the right cables." },
      { q: "Do you supply all-in-one PCs for reception desks?", a: "Yes. All-in-ones from HP, Lenovo and Dell keep reception and counter areas tidy with a single cable." },
      { q: "Do the desktops come with Windows and Office?", a: "They come with Windows 11 Pro. We can add Microsoft 365 or Office licences and install them for you." },
      { q: "Can you deliver and set up desktops across the UAE?", a: "Yes. We deliver across the Emirates, and our team can set up and connect the PCs on site." },
      { q: "How long do business desktops last?", a: "Usually five years or more in an office. Business lines keep parts and drivers available much longer than consumer PCs." },
    ],
    brands: ["HP", "Lenovo", "Dell", "ASUS", "Acer", "Apple"],
  },
  workstations: {
    title: "Workstations for CAD and BIM in the UAE",
    description: "Certified HP Z, Dell Pro Max and Lenovo ThinkStation workstations for CAD, BIM, rendering and AI in Dubai and the UAE, with B2B pricing.",
    lead: [
      "A workstation is the right tool once an office PC starts to hold people back: AutoCAD and Revit models that take minutes to open, rendering that ties up a machine overnight, simulation, video or AI work. What makes it a workstation is certification. HP Z, Dell Pro Max (formerly Precision) and Lenovo ThinkStation models are tested with the software vendors, with NVIDIA RTX professional graphics, error-correcting memory options and cooling built for long full-load runs.",
      "Size the machine by the heaviest file your team opens. Most CAD and BIM users do well with a recent Core i7 or Ultra 7, 32 GB of memory and an RTX A-series or RTX Ada card with 8 to 12 GB; rendering and simulation call for more cores and 64 GB or more. Mobile workstations suit engineers who present on site. Tell us the software and file sizes and we propose two or three configurations with B2B pricing.",
    ],
    compare: [
      { name: "Graphics", why: "NVIDIA RTX professional cards are certified for CAD and BIM; video memory limits model and scene size." },
      { name: "Processor", why: "High clock speed helps modelling; more cores help rendering and simulation." },
      { name: "Memory", why: "32 GB for most CAD, 64 GB and up for large BIM models, rendering and point clouds; ECC for long simulations." },
      { name: "Storage", why: "A fast NVMe SSD for active projects, plus a second drive for libraries and caches." },
      { name: "ISV certification", why: "Check your software (Autodesk, Bentley, Dassault, Adobe) is certified on the model." },
    ],
    table: ["Processor", "Memory", "Storage"],
    faq: [
      { q: "Do we need a workstation for AutoCAD and Revit?", a: "For 2D drafting a strong business desktop is enough. For 3D, Revit and large projects, a certified workstation with an RTX professional card is faster and more stable." },
      { q: "What graphics card is best for BIM?", a: "An NVIDIA RTX A-series or RTX Ada card with 8 to 12 GB of video memory suits most BIM work; large models and real-time rendering benefit from 16 GB or more." },
      { q: "Mobile or tower workstation?", a: "A tower gives more power and upgrades for the price. A mobile workstation suits engineers and architects who present on site or travel." },
      { q: "Can you configure a workstation to our software?", a: "Yes. Tell us the applications and typical file sizes and we propose matched configurations." },
      { q: "Do workstations come with on-site warranty in the UAE?", a: "Business workstations usually carry three years of on-site warranty; we confirm the cover for the exact part number we quote." },
      { q: "Can workstations run AI and machine learning work?", a: "Yes. Models with high-memory RTX professional cards handle local AI development and inference; tell us the frameworks and model sizes." },
    ],
    brands: ["HP", "Dell", "Lenovo", "NVIDIA"],
  },
  servers: {
    title: "Business servers in Dubai, UAE",
    description: "Dell PowerEdge, HPE ProLiant and Lenovo ThinkSystem tower and rack servers for UAE offices: file, ERP, backup and virtualisation, B2B pricing.",
    lead: [
      "A server is worth it when shared files, accounting or ERP software, backups or several virtual machines need to run reliably for the whole office. Tower servers suit small offices without a rack; rack servers fit a server room or data centre and scale better. Dell PowerEdge, HPE ProLiant and Lenovo ThinkSystem are the standard choices, with remote management (iDRAC, iLO, XClarity) so problems can be fixed without a visit.",
      "Plan around the workload, not just the box: how many users, which applications, how much data today and in three years, and how backups will be kept. Hot-swap drives in RAID, redundant power supplies and enough memory for virtualisation make the difference between a server and a desktop under a desk. Tell us what it needs to run and we size it, quote the licences and can install it with our IT team.",
    ],
    compare: [
      { name: "Form factor", why: "Tower for small offices; 1U or 2U rack for a server room." },
      { name: "Processor", why: "Core count drives virtualisation; one socket covers most small and mid-sized offices." },
      { name: "Memory", why: "Plan 8 to 16 GB per virtual machine, and check the maximum for later growth." },
      { name: "Drive bays and RAID", why: "Hot-swap bays with RAID 1, 5 or 10 protect data when a drive fails." },
      { name: "Remote management", why: "iDRAC, iLO or XClarity let support reach the server even when it will not start." },
    ],
    table: ["Form factor", "Processor", "Sockets"],
    faq: [
      { q: "Do we need a server or is cloud enough?", a: "Cloud suits email and most apps. A local server still makes sense for large files, on-premises ERP or accounting, fast backups and offices with slow internet." },
      { q: "Tower or rack server?", a: "A tower fits an office corner without a rack. Choose a rack server if you have a server room or plan more equipment." },
      { q: "Which Windows Server licence do we need?", a: "It depends on cores, virtual machines and users. We quote Windows Server Standard or Datacenter and the user CALs for your setup." },
      { q: "Can you install and configure the server?", a: "Yes. Our team installs the hardware, RAID, operating system, backups and remote management, on site anywhere in the UAE." },
      { q: "What RAID level should we use?", a: "RAID 1 for two drives, RAID 5 or 6 for capacity with protection, RAID 10 for databases. Backups are still needed alongside RAID." },
      { q: "Do you supply servers with UAE warranty?", a: "Yes, with the manufacturer's warranty and next-business-day or faster on-site options." },
    ],
    brands: ["Dell", "HPE", "Lenovo"],
  },
  monitors: {
    title: "Office monitors in Dubai, UAE",
    description: "Business monitors from Dell, HP, Lenovo and ASUS: 24 and 27 inch, USB-C and colour-accurate displays for UAE offices, with B2B pricing.",
    lead: [
      "The right monitor makes every hour at a desk easier, and a second screen is one of the cheapest productivity upgrades an office can make. For most staff a 24 or 27-inch Full HD or QHD IPS monitor with a height-adjustable stand is the standard. USB-C monitors carry video, data and charging over one cable, so a laptop connects with a single plug and the desk stays clear.",
      "Finance and analysts gain from 27-inch QHD or 34-inch ultrawide screens; designers and photographers need colour-accurate panels with factory calibration (sRGB, Adobe RGB or DCI-P3 coverage). Business lines such as Dell UltraSharp and P series, HP E series, Lenovo ThinkVision and ASUS ProArt come with longer warranties and dead-pixel policies. We match monitors to your laptops or desktops and quote whole desks.",
    ],
    compare: [
      { name: "Size and resolution", why: "24-inch Full HD for general work, 27-inch QHD for spreadsheets, 4K or ultrawide for design and multitasking." },
      { name: "Connection", why: "USB-C with power delivery for one-cable laptop desks; DisplayPort or HDMI for desktops." },
      { name: "Panel", why: "IPS for good colour and viewing angles; calibrated panels for design." },
      { name: "Stand", why: "Height, tilt and swivel adjustment is worth it for all-day use." },
      { name: "Refresh rate", why: "60 to 100 Hz is enough for office work; higher only for gaming or fast motion." },
    ],
    table: ["Display", "Refresh rate", "Panel"],
    faq: [
      { q: "What monitor size is best for office work?", a: "24 inches suits most desks; 27 inches with QHD resolution is better for spreadsheets and side-by-side windows." },
      { q: "What is a USB-C monitor and do we need one?", a: "It connects a laptop with one cable for video, USB and charging. It is the simplest setup for hot desks and laptop users." },
      { q: "Can you set up dual monitors?", a: "Yes. We check your laptops or desktops have the outputs and supply the right cables, arms or docks." },
      { q: "Which monitors are good for graphic design?", a: "Factory-calibrated panels such as Dell UltraSharp or ASUS ProArt with high sRGB and DCI-P3 coverage." },
      { q: "Do monitors come with UAE warranty?", a: "Yes, with the manufacturer's local warranty; business lines usually give three years." },
      { q: "Can we order monitor arms with the screens?", a: "Yes. Single and dual arms free up desk space; tell us the desk and screen sizes." },
    ],
    brands: ["Dell", "HP", "Lenovo", "ASUS", "Acer", "MSI"],
  },
  networking: {
    title: "Business networking equipment in the UAE",
    description: "Switches, Wi-Fi access points, routers and firewalls for UAE offices, supplied and installed by our Dubai team, with B2B pricing.",
    lead: [
      "Most office complaints about slow internet are really network problems: consumer routers, unmanaged switches and Wi-Fi that does not reach the meeting room. Business networking equipment fixes that with managed switches you can monitor, access points designed for many users at once, and a firewall that keeps the office safe and lets you control what runs on the network.",
      "Start with the count: how many wired points, how many people and devices on Wi-Fi, and whether cameras, phones or access points need Power over Ethernet. Wi-Fi 6 or 6E access points on a managed, PoE switch, centrally managed in the cloud, is the standard for a modern office. We supply the equipment, survey the site and install it with our networking team, so everything is configured, labelled and documented.",
    ],
    compare: [
      { name: "Ports and speed", why: "Gigabit to the desk, with 10 Gigabit uplinks for servers and busy floors." },
      { name: "PoE budget", why: "Access points, IP phones and cameras draw power from the switch; check the total watts." },
      { name: "Wi-Fi standard", why: "Wi-Fi 6 or 6E for offices with many devices and video calls." },
      { name: "Management", why: "Cloud or web management lets you monitor and change settings without a visit." },
      { name: "Security", why: "A business firewall with VPN, filtering and updates protects the whole office." },
    ],
    table: ["Type", "Ports", "Speed"],
    faq: [
      { q: "How many Wi-Fi access points does an office need?", a: "Roughly one per 20 to 30 people or one per large room, depending on walls and layout. We do a site survey before we quote." },
      { q: "What is PoE and do we need it?", a: "Power over Ethernet sends power through the network cable to access points, phones and cameras, so they need no socket nearby." },
      { q: "Managed or unmanaged switch?", a: "Managed. It lets you separate guest and staff traffic, prioritise calls and see problems before users notice them." },
      { q: "Do we need a firewall if we have a router from the ISP?", a: "For a business, yes. A firewall adds VPN for remote staff, web filtering, threat protection and logs the ISP router does not provide." },
      { q: "Can you install the network as well as supply it?", a: "Yes. Our networking and Wi-Fi service covers survey, cabling, installation and configuration across the UAE." },
      { q: "Is Wi-Fi 6E worth it?", a: "In busy offices and meeting rooms, yes: the 6 GHz band has less interference. Devices need Wi-Fi 6E support to use it." },
    ],
    brands: ["Cisco", "Aruba", "Ubiquiti", "TP-Link Omada", "Fortinet"],
  },
  accessories: {
    title: "Business IT accessories in Dubai, UAE",
    description: "Docking stations, headsets, keyboards, mice, webcams and bags matched to your business laptops, with VAT invoice and B2B pricing in the UAE.",
    lead: [
      "The right accessories turn a laptop into a full desk and make hybrid work comfortable. A docking station connects monitors, network, keyboard and charging with one cable; a certified headset makes Teams and Zoom calls clear in an open office; a full-size keyboard, mouse and a laptop stand protect posture over a long day.",
      "Buy accessories that match the laptops: the same brand's USB-C or Thunderbolt dock, a headset certified for your meeting platform, and bags that fit the screen size. Standardising on one set for everyone makes support and replacements simple. We bundle accessories with laptops and desktops on the same order, so each person's kit arrives together on one VAT invoice.",
    ],
    compare: [
      { name: "Compatibility", why: "Match docks to the laptop's USB-C or Thunderbolt port and power needs." },
      { name: "Connection", why: "Wired for reliability; Bluetooth or a receiver for a clear desk." },
      { name: "Certification", why: "Headsets and webcams certified for Teams or Zoom work without setup." },
      { name: "Comfort", why: "Full-size keyboards, ergonomic mice and stands for all-day work." },
    ],
    table: ["Type", "Connection", "Works with"],
    faq: [
      { q: "Which docking station works with our laptops?", a: "Use the laptop maker's dock where possible (HP, Lenovo, Dell) or a Thunderbolt or USB-C dock with enough power. Send us the models and we match one." },
      { q: "Do you supply Teams-certified headsets?", a: "Yes, wired and wireless headsets certified for Microsoft Teams and Zoom from the main business brands." },
      { q: "Can we buy accessories together with laptops?", a: "Yes. We bundle each person's laptop, dock, headset, keyboard and mouse on one order and invoice." },
      { q: "Do accessories come with warranty?", a: "Yes, the manufacturer's warranty applies; business docks and headsets usually carry one to three years." },
      { q: "Do you have Arabic keyboards?", a: "Yes. Arabic and English keyboards are available in most business ranges." },
    ],
    brands: ["HP", "Lenovo", "Dell", "Logitech", "Jabra", "Microsoft"],
  },

  // ---- video conferencing and meeting rooms (our highest search demand) ----
  "video-conferencing": {
    title: "Video conferencing systems in Dubai, UAE",
    description: "Meeting room cameras, speakerphones, room kits, wireless presentation and displays for Teams and Zoom rooms in Dubai and the UAE. Get pricing.",
    lead: [
      "A good meeting room lets everyone be seen and heard, and lets anyone share a screen in seconds, whether people join from the room or from home. That takes four things working together: a camera that frames the whole table, microphones and speakers that pick up every voice, a display that everyone can read, and a simple way to start the meeting and share content.",
      "Start with the room size and your platform. Small huddle rooms are best served by an all-in-one video bar; medium and large boardrooms need a separate camera, ceiling or table microphones and a larger display. Microsoft Teams Rooms and Zoom Rooms certified kits are the easiest to run, with a touch panel on the table. Choose the kind of equipment below, or tell us the rooms and we will quote complete systems.",
    ],
    compare: [
      { name: "Room size", why: "Huddle (2-4), small (4-6), medium (6-12) or large (12+) decides the camera, microphones and screen." },
      { name: "Platform", why: "Microsoft Teams Rooms, Zoom Rooms or bring-your-own-device: certified kits are easier to manage." },
      { name: "Camera coverage", why: "Field of view and auto-framing so people at the ends of the table are seen." },
      { name: "Audio pickup", why: "Microphone range and number of mics, so the far end hears everyone clearly." },
      { name: "Content sharing", why: "Wireless presentation so guests share without cables or drivers." },
    ],
    table: ["Type", "Room size", "Platform"],
    faq: [
      { q: "What do we need for a Microsoft Teams Room?", a: "A certified room kit (compute, camera, audio and a touch console), a display, and a Teams Rooms licence per room. Huddle rooms can use one video bar with a touch panel." },
      { q: "What is the difference between a video bar and a room kit?", a: "A video bar combines camera, microphones and speakers in one unit for small rooms. A room kit adds separate microphones, a computer and a touch panel for larger rooms." },
      { q: "Which equipment works with both Teams and Zoom?", a: "Many video bars and cameras can join either platform, and most USB cameras and speakerphones work with any software on a laptop. Certified kits run one platform natively and join the other's meetings." },
      { q: "How big should the meeting room display be?", a: "As a rule, the farthest seat should be no more than about four times the screen height away. Medium rooms usually need 65 to 75 inches; boardrooms 85 inches or a dual display." },
      { q: "Can people share their laptop screen wirelessly?", a: "Yes. Wireless presentation systems let staff and guests share with a button or an app, with no cables or adapters." },
      { q: "Do you install meeting room systems in the UAE?", a: "Yes. We supply the hardware and our AV team installs, mounts, cables and sets up the room across the UAE." },
      { q: "Can we get pricing for several rooms at once?", a: "Yes. Send the number of rooms, their size and your platform, and we quote each room with B2B pricing on one VAT invoice." },
    ],
    brands: ["Logitech", "Poly", "Yealink", "Jabra", "Barco ClickShare", "Samsung", "LG", "Crestron"],
  },
  "conference-cameras": {
    title: "Conference cameras in Dubai, UAE",
    description: "PTZ, 4K and auto-framing conference cameras for Teams and Zoom meeting rooms in Dubai and across the UAE, with B2B pricing.",
    lead: [
      "The camera decides whether remote attendees can see who is speaking. For small rooms a 4K camera with a wide field of view and auto-framing keeps everyone in the picture; for boardrooms and training rooms a pan-tilt-zoom (PTZ) camera with optical zoom reaches the far end of the table, and speaker tracking follows whoever is talking.",
      "Check the field of view against the room: 90 degrees suits a long table seen from one end, 120 degrees or more suits a wide huddle room where people sit close to the screen. USB cameras work with any laptop or room computer and any platform; certified cameras for Microsoft Teams Rooms and Zoom Rooms support features such as multi-person framing. Tell us the room size and seating and we recommend the right camera and mounting.",
    ],
    compare: [
      { name: "Resolution", why: "4K gives sharper digital zoom and framing; 1080p is enough for small rooms." },
      { name: "Field of view", why: "Wide (120°+) for huddle rooms; narrower with optical zoom for long rooms." },
      { name: "Zoom", why: "Optical zoom keeps detail at the far end of large rooms; digital zoom suits small ones." },
      { name: "Auto-framing and tracking", why: "Keeps the group or the active speaker in frame automatically." },
      { name: "Connection", why: "USB for simple setups; HDMI or IP for larger installed rooms." },
    ],
    table: ["Resolution", "Field of view", "Zoom"],
    faq: [
      { q: "Which conference camera is best for a small meeting room?", a: "A 4K USB camera with a wide field of view (around 120°) and auto-framing, mounted above or below the screen." },
      { q: "What is a PTZ camera?", a: "A pan-tilt-zoom camera that turns and zooms, often with presets and speaker tracking. It suits boardrooms, training rooms and large tables." },
      { q: "Do conference cameras work with both Teams and Zoom?", a: "USB conference cameras work with any software on the connected computer. Certified cameras add platform features in Teams Rooms or Zoom Rooms." },
      { q: "Do we need optical zoom?", a: "In rooms longer than about 6 metres, yes: optical zoom keeps faces sharp at the far end where digital zoom loses detail." },
      { q: "Can the camera follow whoever is speaking?", a: "Yes. Cameras with speaker tracking, or paired with tracking microphones, switch to the active speaker automatically." },
      { q: "Do you mount and install the cameras?", a: "Yes. Our AV team mounts the camera at the right height, runs the cables and tests it with your meeting platform." },
    ],
    brands: ["Logitech", "Poly", "Yealink", "Jabra", "AVer"],
  },
  "conference-audio": {
    title: "Speakerphones and conference audio, UAE",
    description: "Speakerphones, ceiling and table microphones and room audio for clear Teams and Zoom calls in Dubai and UAE meeting rooms, with B2B pricing.",
    lead: [
      "Remote attendees forgive a soft picture, but not bad sound. Conference audio has two jobs: picking up every voice in the room without echo or background noise, and playing the far end clearly. A USB or Bluetooth speakerphone is enough for a desk or a small huddle space; larger rooms need table or ceiling microphones and speakers spread across the table.",
      "Look at the pickup range against the table length, and at echo cancellation and noise suppression, which make the biggest difference in hard-walled UAE offices with glass partitions. Daisy-chaining two speakerphones or adding expansion microphones covers longer tables. Certified audio for Microsoft Teams or Zoom works without setting up. Tell us the room and how many people sit in it and we match the audio to the camera and display.",
    ],
    compare: [
      { name: "Pickup range", why: "Covers the full table; add expansion mics or a second unit for longer rooms." },
      { name: "Echo and noise control", why: "Essential in rooms with glass and hard surfaces." },
      { name: "Connection", why: "USB or Bluetooth for laptops and huddle rooms; networked audio for installed rooms." },
      { name: "Microphone placement", why: "Table units are easy to add; ceiling microphones keep the table clear." },
      { name: "Certification", why: "Teams or Zoom certified for plug-and-play calls." },
    ],
    table: ["Type", "Pickup range", "Connection"],
    faq: [
      { q: "Is a speakerphone enough for a meeting room?", a: "For up to about six people around a small table, yes. Larger rooms need expansion microphones, a second unit or ceiling microphones." },
      { q: "Ceiling or table microphones?", a: "Table microphones are simpler and cheaper; ceiling microphones keep the table clear and suit boardrooms and rooms that change layout." },
      { q: "How do we stop echo in meeting rooms?", a: "Use audio with echo cancellation, keep microphones away from the speakers, and add soft surfaces in rooms with a lot of glass." },
      { q: "Can we connect two speakerphones together?", a: "Many business speakerphones can be linked to cover a longer table. We confirm which models pair together." },
      { q: "Do speakerphones work with a laptop?", a: "Yes. USB and Bluetooth speakerphones work with any laptop and meeting app." },
      { q: "Can you install room audio?", a: "Yes. Our AV team installs ceiling microphones, speakers and processors and tunes the room." },
    ],
    brands: ["Jabra", "Poly", "Yealink", "Shure", "Logitech"],
  },
  "room-kits": {
    title: "All-in-one meeting room kits, UAE",
    description: "Microsoft Teams Rooms and Zoom Rooms video bars and room kits for huddle, small and medium rooms in Dubai and the UAE, with B2B pricing.",
    lead: [
      "An all-in-one room kit is the fastest way to equip a meeting room: one video bar with camera, microphones and speakers, plus a touch panel on the table to start or join a meeting with one tap. Kits certified for Microsoft Teams Rooms or Zoom Rooms run the meeting software themselves, so nobody needs to bring a laptop, and IT can manage every room centrally.",
      "Choose by room size. Huddle rooms for two to four people suit a compact video bar; small and medium rooms need a bar with a wider pickup range and possibly an extra microphone. Some bars also work in USB mode, so staff can run any platform from their own laptop. Every kit needs a display and a platform licence per room. Send us the room sizes and the platform you use and we quote the complete kit, display and mounting.",
    ],
    compare: [
      { name: "Room size", why: "Each kit is designed for a range of room sizes and seats." },
      { name: "Platform", why: "Teams Rooms, Zoom Rooms, or USB mode for bring-your-own-device." },
      { name: "Camera", why: "Auto-framing and speaker focus keep the group in view." },
      { name: "Audio", why: "Built-in microphone range, with expansion mics for larger rooms." },
      { name: "Management", why: "Central device management for IT across several rooms." },
    ],
    table: ["Room size", "Camera", "Platform"],
    faq: [
      { q: "What is a video bar?", a: "A single unit that combines a camera, microphones and speakers, mounted above or below the display. With a computer built in it can run Teams Rooms or Zoom Rooms on its own." },
      { q: "Do we need a licence for a Teams Room?", a: "Yes. Each Microsoft Teams Rooms device needs a Teams Rooms Basic or Pro licence; Zoom Rooms has its own room licence." },
      { q: "Can a room kit work with both Teams and Zoom?", a: "Certified kits run one platform natively and can join the other's meetings. Kits with USB mode let a laptop use any platform." },
      { q: "Which kit suits a huddle room?", a: "A compact video bar with a touch panel, mounted under a 50 to 55-inch display, covers two to four people." },
      { q: "Is a display included in the kit?", a: "Usually not. We quote the right display size for the room alongside the kit." },
      { q: "Can you set up several rooms the same way?", a: "Yes. We standardise the kit, mounting and settings so every room works the same, and install across the UAE." },
    ],
    brands: ["Logitech", "Poly", "Yealink", "Jabra", "Neat"],
  },
  "wireless-presentation": {
    title: "Wireless presentation and BYOD, UAE",
    description: "Wireless presentation and BYOD systems so staff and guests share laptops to the meeting room screen in seconds. Dubai and UAE, B2B pricing.",
    lead: [
      "Wireless presentation ends the search for the right cable. Staff and visitors share their laptop, phone or tablet to the room display with a button or an app, and several people can share in turn without unplugging anything. Bring-your-own-device (BYOD) systems go further: one USB connection gives the laptop the room's camera, microphones and display, so any meeting platform can run from the guest's own computer.",
      "For boardrooms and client-facing rooms, button-based systems are the simplest for visitors; app-based sharing suits internal rooms. Check how many people can share at once, 4K support, and network security, because guests should not join your office network to present. Tell us how the rooms are used and whether people bring their own laptops, and we recommend the right system.",
    ],
    compare: [
      { name: "Sharing method", why: "A USB button for guests, an app or native casting for staff." },
      { name: "Simultaneous sharing", why: "Two to four sources on screen for comparing and collaborating." },
      { name: "Resolution", why: "4K output for large displays and detailed content." },
      { name: "BYOD conferencing", why: "Uses the room camera and audio from a laptop for any platform." },
      { name: "Security", why: "Guest sharing without joining the corporate network." },
    ],
    table: ["Sharing method", "Simultaneous sources", "Resolution"],
    faq: [
      { q: "What is a wireless presentation system?", a: "A receiver connected to the room display and buttons or an app that let anyone share their screen without a cable." },
      { q: "What does BYOD mean in a meeting room?", a: "Bring your own device: the presenter's laptop runs the meeting and uses the room's camera, microphones and display through one connection." },
      { q: "Can visitors present without joining our network?", a: "Yes. Button-based systems and guest modes let visitors share without access to your corporate network." },
      { q: "Can several people share at the same time?", a: "Most business systems show two to four sources on screen at once." },
      { q: "Does it work with Mac, Windows, iPhone and Android?", a: "Business systems support all of them, through a button, an app or built-in casting such as AirPlay and Miracast." },
      { q: "Can wireless presentation work with Teams and Zoom calls?", a: "Yes. BYOD-capable systems pass the room's camera and audio to the laptop so it can run any meeting platform." },
    ],
    brands: ["Barco ClickShare", "Logitech", "Yealink", "Crestron"],
  },
  "meeting-room-displays": {
    title: "Meeting room displays in Dubai, UAE",
    description: "Commercial 4K displays and interactive screens for meeting rooms and boardrooms in Dubai and the UAE, sized for the room, with B2B pricing.",
    lead: [
      "A meeting room display should be big enough that the person in the farthest seat can read a spreadsheet, and built to run all day. Commercial displays are designed for exactly that: rated for long daily use, with the right inputs, wall-mount options and a warranty that covers business use, unlike a consumer TV.",
      "Size the screen from the farthest seat: as a rule, that seat should be no more than about four times the screen height away. Most medium rooms need 65 to 75 inches; boardrooms often use 85 inches or two displays, one for people and one for content. Interactive touch displays add whiteboarding for training and workshop rooms. We quote the display with the right mount, cabling and the video conferencing kit for the room.",
    ],
    compare: [
      { name: "Size", why: "Matched to the distance of the farthest seat." },
      { name: "Resolution", why: "4K keeps text sharp on large screens." },
      { name: "Duty rating", why: "Commercial panels rated for 16 hours a day or more." },
      { name: "Brightness", why: "Higher brightness for rooms with daylight and glass walls." },
      { name: "Touch", why: "Interactive displays for whiteboarding and training rooms." },
    ],
    table: ["Size", "Resolution", "Brightness"],
    faq: [
      { q: "What size screen do we need for our meeting room?", a: "Measure the distance to the farthest seat; the screen height should be at least a quarter of it. For most rooms that means 65 to 75 inches, 85 inches or dual screens for boardrooms." },
      { q: "Can we use a normal TV in a meeting room?", a: "It works, but commercial displays are rated for longer daily use, have business warranties and management features, and handle all-day video calls better." },
      { q: "Do we need a touch screen?", a: "Only for whiteboarding, training or workshop rooms. Most meeting rooms use a standard display with wireless sharing." },
      { q: "One or two displays in a boardroom?", a: "Two displays let remote people and shared content be seen at the same time, which helps in large rooms and client meetings." },
      { q: "Do you supply wall mounts and install the display?", a: "Yes. We supply the mount and our team installs the display, conceals cables and connects the room system." },
      { q: "Which inputs should a meeting room display have?", a: "At least two HDMI inputs, USB-C if laptops connect directly, and a network port for management." },
    ],
    brands: ["Samsung", "LG", "Sony", "Philips", "ViewSonic"],
  },
  "room-control-panels": {
    title: "Room control panels and booking, UAE",
    description: "Touch control panels and room booking screens for Teams Rooms and Zoom Rooms meeting rooms in Dubai and across the UAE, with B2B pricing.",
    lead: [
      "A touch panel on the table makes a meeting room easy for everyone: one tap to join the next meeting, share content, adjust the camera or end the call. Room booking panels outside the door show whether the room is free and let people book or extend a meeting on the spot, which stops double bookings and ghost meetings.",
      "Control panels are usually tied to the room system and platform: Microsoft Teams Rooms and Zoom Rooms each certify their own consoles, and many video bar makers include a panel with the kit. Booking panels connect to Microsoft 365 or Google Workspace calendars. Check power over Ethernet support, mounting (table, wall or glass) and whether the panel suits your platform. We quote panels with the room kit and set up the calendar integration.",
    ],
    compare: [
      { name: "Platform", why: "Certified for Teams Rooms or Zoom Rooms, matched to the room system." },
      { name: "Use", why: "In-room controller on the table, or a booking panel outside the door." },
      { name: "Screen size", why: "Larger screens for in-room control, smaller for door panels." },
      { name: "Power and network", why: "PoE means one cable for power and data." },
      { name: "Mounting", why: "Table, wall or glass mounts to suit the room." },
    ],
    table: ["Platform", "Screen size", "Mounting"],
    faq: [
      { q: "What is a meeting room control panel?", a: "A touch screen on the table that starts and joins meetings, shares content and controls the camera and volume." },
      { q: "What is a room booking panel?", a: "A small screen outside the room that shows if it is free and lets people book or extend a meeting from the door." },
      { q: "Do booking panels work with Outlook calendars?", a: "Yes. Business booking panels connect to Microsoft 365 or Google Workspace room calendars." },
      { q: "Is the control panel included with a room kit?", a: "Many kits include one. We confirm what is in the box and quote a panel when it is not." },
      { q: "Do panels need a power socket?", a: "Most business panels run on Power over Ethernet, so one network cable powers them." },
      { q: "Can you set up the booking calendar integration?", a: "Yes. We configure the room mailboxes and the panels so bookings show correctly." },
    ],
    brands: ["Logitech", "Poly", "Yealink", "Crestron"],
  },
};

/** The search title a category page uses when the editor set none. */
export function categorySeoTitle(slug: string): string | undefined {
  return CATEGORY_SEO[slug]?.title;
}
