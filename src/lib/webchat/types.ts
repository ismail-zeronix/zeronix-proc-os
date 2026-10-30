/** Shapes shared by the website chat's server code, the portal's Website tab and the public widget (no server imports). */

export type WebChatStatus = "waiting" | "active" | "closed";
export type WebSender = "visitor" | "agent" | "system";

export interface WebMessage {
  id: number;
  chatId: number;
  sender: WebSender;
  /** The agent's name on an agent line. */
  name: string | null;
  body: string;
  createdAt: string;
}

/** One row in the portal's Website tab. */
export interface WebChatSummary {
  id: number;
  status: WebChatStatus;
  /** Filled in once the visitor has sent the lead form. */
  lead: { name: string; email: string; phone: string; company: string } | null;
  pageUrl: string;
  pageTitle: string;
  referrer: string;
  /** The visitor's page is open right now. */
  online: boolean;
  agent: { id: number; name: string } | null;
  lastPreview: string;
  lastMessageAt: string | null;
  /** Visitor lines the agent has not read (only counted for the agent on it). */
  unread: number;
  createdAt: string;
  closedAt: string | null;
  /** The visitor's stars after the chat (1-5). */
  rating: number | null;
  /** The CRM lead saved from this chat. */
  dealId: number | null;
  /** "🇦🇪 Dubai" from their IP, when known. */
  place: string | null;
  /** Visits from their browser so far (1 = first time on the site). */
  visits: number;
}

/** One page the visitor opened: when, how long they stayed and how far down they scrolled (sent when they leave it). */
export interface WebPageVisit {
  url: string;
  title: string;
  at: string;
  seconds?: number;
  scroll?: number;
}

/** What the visitor's browser tells the widget (all optional: browsers differ, and private windows hide some). */
export interface WebClientInfo {
  /** "en-GB", and every language they have set. */
  language?: string;
  languages?: string[];
  /** "Asia/Dubai" and minutes from UTC. */
  timeZone?: string;
  utcOffset?: number;
  screen?: { w: number; h: number };
  viewport?: { w: number; h: number };
  pixelRatio?: number;
  touchPoints?: number;
  cores?: number;
  /** GB of memory, rounded by the browser. */
  memoryGb?: number;
  darkMode?: boolean;
  connection?: { type?: string; downlinkMbps?: number; rttMs?: number; saveData?: boolean };
  cookies?: boolean;
  doNotTrack?: boolean;
  /** Chrome / Edge / Android: brand list, device model, OS version, CPU. */
  hints?: { brands?: string[]; mobile?: boolean; platform?: string; platformVersion?: string; model?: string; architecture?: string; bitness?: string };
  /** utm_source, utm_medium, utm_campaign, utm_term, utm_content, and ad click ids (gclid, fbclid, msclkid). */
  campaign?: Record<string, string>;
  /** The first page of this visit and the site that sent them there. */
  landing?: string;
  firstReferrer?: string;
  /** Visits from this browser (counting this one) and when the first was. */
  visits?: number;
  firstSeen?: string;
}

/** Where the visitor is: "ip" from their IP address (city level, no permission needed), "precise" only if they allowed location. */
export interface WebGeo {
  ip?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    flag?: string;
    postal?: string;
    lat?: number;
    lon?: number;
    timeZone?: string;
    /** Internet provider and the network's owner (sometimes the visitor's company). */
    isp?: string;
    org?: string;
    domain?: string;
    asn?: number;
  };
  precise?: { lat: number; lon: number; accuracyM: number; address: string; area?: string; city?: string; at: string };
}

/** Everything the portal's visitor panel shows beside a website chat. */
export interface WebVisitorInfo {
  userAgent: string;
  ip: string;
  referrer: string;
  pages: WebPageVisit[];
  client: WebClientInfo | null;
  geo: WebGeo | null;
  /** Their earlier chats (same browser), newest first. */
  previous: { id: number; createdAt: string; status: WebChatStatus; rating: number | null }[];
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  rating: number | null;
  feedbackTags: string[];
  feedback: string;
  dealId: number | null;
}

/** What the visitor's widget knows about their chat. */
export interface VisitorState {
  status: WebChatStatus;
  leadDone: boolean;
  /** The sales person who accepted it. */
  agent: { name: string; title: string } | null;
  messages: WebMessage[];
  /** Sales people online right now (first name and job title only). */
  team: { name: string; title: string }[];
  /** The visitor has already rated this chat (the widget skips the rating). */
  rated: boolean;
}

/** Feedback chips the widget offers after a chat: the first set for 4-5 stars, the second for 1-3. */
export const FEEDBACK_GOOD = ["Quick reply", "Friendly and helpful", "Got the information I needed", "Good prices"] as const;
export const FEEDBACK_BAD = ["Slow to reply", "My question was not answered", "Prices too high", "I would prefer a call"] as const;
export const FEEDBACK_TAGS: readonly string[] = [...FEEDBACK_GOOD, ...FEEDBACK_BAD];

/** Events the live stream sends to a visitor's widget. */
export type VisitorEvent =
  | { t: "message"; message: WebMessage }
  | { t: "state"; status: WebChatStatus; agent: VisitorState["agent"] }
  | { t: "typing" }
  | { t: "team"; team: VisitorState["team"] };

/** Short lines as the portal lists them. */
export function webPreview(m: Pick<WebMessage, "sender" | "body">): string {
  const text = m.body.replace(/\s+/g, " ").trim();
  return m.sender === "agent" ? `Sales: ${text}` : text;
}

/** "Ahmed (Acme Trading)", or "Visitor #12" before the lead form. */
export function visitorLabel(c: Pick<WebChatSummary, "id" | "lead">): string {
  if (!c.lead) return `Visitor #${c.id}`;
  return c.lead.company ? `${c.lead.name} (${c.lead.company})` : c.lead.name;
}

/** The path of a page URL ("/laptops/thinkpad"), for compact lists. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

/** The longest website chat line either side may send. */
export const MAX_WEB_BODY = 2000;
