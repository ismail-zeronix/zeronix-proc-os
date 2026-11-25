import type { Qa } from "./seo-categories";

/**
 * Video conferencing landing pages per emirate (/video-conferencing/{place}), our highest search demand. Each has its
 * own title, headline, intro and questions, written for that place, and links to the meeting-room product categories.
 * Only facts about the emirates that are common knowledge; promises limited to what the site says elsewhere.
 */

export interface EmiratePage {
  slug: string;
  place: string;
  /** Without " · Zeronix Tech" (45 characters at most). */
  title: string;
  description: string;
  h1: string;
  intro: string[];
  /** Short points: who we equip there. */
  points: string[];
  faq: Qa[];
}

export const EMIRATE_PAGES: EmiratePage[] = [
  {
    slug: "dubai",
    place: "Dubai",
    title: "Video conferencing systems in Dubai",
    description: "Video conferencing systems for Dubai offices: Teams and Zoom room kits, cameras, speakerphones and displays, supplied and installed. Get pricing.",
    h1: "Video conferencing systems in Dubai",
    intro: [
      "Dubai offices run on meetings that span time zones: head offices in Europe and Asia, clients across the GCC and teams split between Business Bay, DIFC, Dubai Internet City and home. A meeting room that works first time, every time, is now basic infrastructure, and so is a huddle room where two people can join a call without booking IT.",
      "We supply complete video conferencing systems for Dubai companies, from a single video bar for a huddle room to dual-display boardrooms with ceiling microphones and room booking panels. We quote certified Microsoft Teams Rooms and Zoom Rooms kits, size the camera, audio and display to each room, and our AV team installs them in free zone and mainland offices alike.",
    ],
    points: ["Huddle rooms and focus booths in co-working and serviced offices", "Boardrooms with dual displays for client presentations", "Training rooms with PTZ cameras and wireless presentation", "Standard room designs rolled out across several floors"],
    faq: [
      { q: "Do you install video conferencing in Dubai free zone offices?", a: "Yes. We work in free zone and mainland offices across Dubai, including DIFC, Dubai Internet City, JLT and Business Bay, and coordinate access with building management." },
      { q: "How quickly can a Dubai meeting room be set up?", a: "Once the equipment is confirmed and on hand, a typical small or medium room is installed and tested in a day. Larger boardrooms with ceiling audio take longer; we confirm the schedule with the quote." },
      { q: "Can you equip a co-working or serviced office room?", a: "Yes. Compact video bars with a touch panel suit small rooms where nothing can be drilled or cabled, and USB kits let tenants use their own laptops." },
      { q: "Should our Dubai rooms be Teams or Zoom rooms?", a: "Choose the platform your company already uses for most meetings. We quote certified Microsoft Teams Rooms or Zoom Rooms kits, or BYOD rooms that run any platform from a laptop." },
      { q: "Can we see options before we buy?", a: "Send us the room photos and sizes and we propose two or three options with pricing, explaining the difference in coverage and features." },
    ],
  },
  {
    slug: "abu-dhabi",
    place: "Abu Dhabi",
    title: "Video conferencing in Abu Dhabi",
    description: "Meeting room video conferencing for Abu Dhabi companies and government-linked offices: cameras, audio, displays and Teams Rooms kits. Get pricing.",
    h1: "Video conferencing systems for Abu Dhabi offices",
    intro: [
      "Abu Dhabi organisations often hold formal meetings with many participants: board sessions, committees and project reviews that connect the capital with Dubai, the regions and international partners. These rooms need more than a webcam on a screen. They need cameras that frame a long table, microphones that pick up every seat, and content sharing that guests can use without help.",
      "We supply video conferencing equipment for Abu Dhabi offices, sized room by room, and deliver it to the capital and Al Ain. For large rooms we combine PTZ cameras with speaker tracking, ceiling or table microphone arrays and dual displays; for smaller rooms, certified video bars keep things simple. We document every room the same way, so IT teams can support them without surprises.",
    ],
    points: ["Boardrooms and committee rooms with speaker tracking", "Project offices connecting Abu Dhabi, Dubai and site teams", "Standardised rooms that IT can support centrally", "Wireless presentation for visiting consultants and partners"],
    faq: [
      { q: "Do you deliver and install meeting room equipment in Abu Dhabi?", a: "Yes. We deliver to Abu Dhabi city and Al Ain, and our team installs and tests the rooms on site." },
      { q: "What do you recommend for a large boardroom?", a: "A PTZ camera with speaker tracking or a dual-camera setup, ceiling or table microphone arrays, two displays and a touch panel, so every seat is seen and heard." },
      { q: "Can the rooms be managed centrally by our IT team?", a: "Yes. Certified Teams Rooms and Zoom Rooms devices are managed from the platform's admin portal, and most kits also have their own management tools." },
      { q: "Can you supply against a specification or tender list?", a: "Yes. Send us the bill of materials or specification and we quote each line, suggesting equivalents where a model is unavailable." },
      { q: "Can visitors present from their own laptops?", a: "Yes. Wireless presentation buttons let guests share without joining your network." },
    ],
  },
  {
    slug: "sharjah",
    place: "Sharjah",
    title: "Video conferencing in Sharjah",
    description: "Affordable video conferencing for Sharjah businesses: video bars, conference cameras, speakerphones and meeting room displays. Ask for pricing.",
    h1: "Video conferencing systems in Sharjah",
    intro: [
      "Many Sharjah businesses, from trading and manufacturing companies to schools and family offices, need meeting rooms that simply work, without the cost of a large AV project. The most useful upgrade is often the simplest: a video bar under a commercial display, a speakerphone that picks up the whole table, and a wireless sharing button so nobody hunts for cables.",
      "We supply video conferencing equipment to Sharjah companies with clear options at each budget. For a first room we usually suggest a USB video bar that works with any laptop and any platform; as more rooms are added, certified Teams Rooms or Zoom Rooms kits make them easier to run. We quote complete rooms with mounting and cabling, and install them on site.",
    ],
    points: ["Practical first meeting rooms for growing businesses", "Rooms for trading and manufacturing companies talking to suppliers abroad", "Classrooms and staff rooms for schools", "Upgrades of existing rooms with better audio"],
    faq: [
      { q: "What is the most affordable way to set up a video meeting room?", a: "A USB video bar with built-in camera, microphones and speakers under a commercial display, connected to a laptop. It works with Teams, Zoom and Google Meet." },
      { q: "Do you serve Sharjah industrial areas and free zones?", a: "Yes. We deliver and install across Sharjah, including the industrial areas, SAIF Zone and Hamriyah." },
      { q: "Can you improve the audio in our existing meeting room?", a: "Yes. Adding a business speakerphone or expansion microphones often fixes echo and missed voices without replacing the rest of the room." },
      { q: "Do you equip classrooms for hybrid teaching?", a: "Yes. A wide-angle camera, a room microphone and a display let teachers include remote students." },
      { q: "Can we buy the equipment without installation?", a: "Yes. We can supply the hardware only, or supply and install." },
    ],
  },
  {
    slug: "ras-al-khaimah",
    place: "Ras Al Khaimah",
    title: "Video conferencing in Ras Al Khaimah",
    description: "Video conferencing and meeting room hardware for Ras Al Khaimah companies, free zone offices and sites, delivered from Dubai. Get B2B pricing.",
    h1: "Video conferencing for Ras Al Khaimah businesses",
    intro: [
      "Companies in Ras Al Khaimah often work at a distance: free zone businesses whose customers are in Dubai or abroad, industrial and hospitality operations whose management sits elsewhere, and site offices that need to report into head office every day. Good video conferencing turns those distances into a meeting room down the corridor.",
      "We supply meeting room cameras, audio, displays and room kits to Ras Al Khaimah companies and deliver from Dubai. Because a visit takes longer to arrange, we favour reliable, centrally manageable kits that work first time, standardise each room, and set them up so they can be supported remotely. Tell us the rooms and we quote complete systems, with installation on site.",
    ],
    points: ["Free zone offices meeting clients in Dubai and abroad", "Industrial and quarry site offices reporting to head office", "Hotel and resort meeting and event rooms", "Rooms set up for remote support"],
    faq: [
      { q: "Do you deliver to Ras Al Khaimah?", a: "Yes. We deliver across Ras Al Khaimah, including RAKEZ and the industrial areas, from Dubai." },
      { q: "Can you install meeting rooms in Ras Al Khaimah?", a: "Yes. Our team travels to site to install and test. We plan the visit so several rooms are done together." },
      { q: "Can the rooms be supported remotely?", a: "Yes. We choose kits with remote management and set them up so most issues can be checked and fixed without a visit." },
      { q: "What suits a site office with limited space?", a: "A compact video bar with a 50 to 55-inch display, or a speakerphone and webcam for very small rooms." },
      { q: "Do you supply hotels with meeting room equipment?", a: "Yes. We supply displays, wireless presentation and conferencing kits for meeting and event rooms." },
    ],
  },
  {
    slug: "uae",
    place: "the UAE",
    title: "Video conferencing systems in the UAE",
    description: "Video conferencing hardware across the UAE: Teams and Zoom room kits, cameras, audio, wireless presentation and displays, quoted per room.",
    h1: "Video conferencing systems across the UAE",
    intro: [
      "When a company has offices in more than one emirate, every meeting room should work the same way: the same touch panel, the same way to share a screen, and the same picture and sound quality whether the meeting starts in Dubai, Abu Dhabi or the northern emirates. That consistency is what makes hybrid meetings feel normal instead of a technical exercise.",
      "We supply video conferencing hardware to companies across all seven emirates and help them standardise: a small set of room designs (huddle, small, medium, boardroom), each with a defined camera, audio, display and control panel, rolled out wherever the company has space. One supplier and one set of part numbers keeps support simple. Send us the list of rooms and locations and we quote them together.",
    ],
    points: ["Standard room designs across several emirates", "One quote and one VAT invoice for every location", "Certified Teams Rooms and Zoom Rooms kits, or BYOD", "Supply only, or supply and install"],
    faq: [
      { q: "Do you supply video conferencing equipment across all emirates?", a: "Yes. We deliver to all seven emirates: Dubai, Abu Dhabi, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah." },
      { q: "Can you standardise meeting rooms across several offices?", a: "Yes. We define a few room designs by size and roll them out everywhere, so users and IT get the same experience in every room." },
      { q: "Can we get one quote for rooms in different emirates?", a: "Yes. Send us the rooms and locations and we quote them together on one VAT invoice." },
      { q: "Is the equipment covered by warranty in the UAE?", a: "Yes. We supply with the manufacturer's warranty; we confirm the terms for each model in the quote." },
      { q: "Which brands do you supply?", a: "We quote the leading meeting room brands, such as Logitech, Poly, Yealink, Jabra, Barco ClickShare, Samsung and LG, and recommend what fits each room." },
    ],
  },
];

export const emiratePage = (slug: string) => EMIRATE_PAGES.find((e) => e.slug === slug);
