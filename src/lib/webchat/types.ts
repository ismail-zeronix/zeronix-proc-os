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
}

/** Everything the portal's visitor panel shows beside a website chat. */
export interface WebVisitorInfo {
  userAgent: string;
  ip: string;
  referrer: string;
  pages: { url: string; title: string; at: string }[];
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
