/** Shapes shared by the chat server code and the widget (no server imports here). */

export type ChannelKind = "dm" | "group" | "record" | "system";
export type MessageKind = "text" | "card" | "system";

/** A record attached to a message (filled in from phase 3: mention cards and `#` links). */
export interface ChatCard {
  type: string;
  id: number;
  /** What happened, e.g. "mention" or "call". */
  event?: string;
  excerpt?: string;
  /** Key fields at the time it was sent, shown if the live record cannot be read. */
  snapshot?: Record<string, unknown>;
}

export interface ChatUser {
  id: number;
  name: string;
}

/** One row in the conversation list. */
export interface ChannelSummary {
  id: number;
  kind: ChannelKind;
  /** For a DM, the other person's name; for a deal thread, the deal title. */
  name: string;
  topic: string;
  isPrivate: boolean;
  /** My role in it: the owner of a group can rename it, change who is in it and archive it. */
  role: "owner" | "member";
  /** For a DM, the other person. */
  peer: ChatUser | null;
  members: (ChatUser & { role: "owner" | "member" })[];
  /** For a deal thread: the deal it belongs to, and where to open it. */
  record: { type: string; id: number; href: string; subtitle: string } | null;
  lastMessageAt: string | null;
  lastPreview: string;
  lastFrom: string | null;
  lastFromId: number | null;
  unread: number;
  muted: boolean;
}

/** The message a reply quotes. */
export interface ReplyRef {
  id: number;
  userName: string | null;
  body: string;
  deleted: boolean;
}

export interface Reaction {
  emoji: string;
  userIds: number[];
}

export interface ChatMessage {
  id: number;
  channelId: number;
  userId: number | null;
  userName: string | null;
  kind: MessageKind;
  body: string;
  card: ChatCard | null;
  replyTo: ReplyRef | null;
  /** Set on a thread reply: the message it answers. */
  threadId: number | null;
  replyCount: number;
  reactions: Reaction[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export type CardTone = "blue" | "green" | "amber" | "red" | "violet" | "slate";

/** A record as a card shows it, read live for the person looking (see lib/chat/cards.ts). */
export interface CardView {
  /** "deal:12" */
  ref: string;
  type: string;
  id: number;
  /** They may not see this record: the card says so and shows nothing of it. */
  restricted?: boolean;
  /** The record was deleted. */
  missing?: boolean;
  title: string;
  /** Company, supplier, or what kind of record it is. */
  subtitle?: string;
  href?: string;
  status?: { label: string; tone: CardTone };
  amount?: string;
  /** Small extra lines: "Valid until 3 Nov", "Due tomorrow". */
  facts?: string[];
  people?: ChatUser[];
  /** For a chat-message card: the conversation to open. */
  channelId?: number;
  /** Buttons the viewer may use on it (e.g. "Mark done"); they run the same rules as the record's own page. */
  actions?: { key: string; label: string }[];
}

/** A public group someone can join. */
export interface OpenGroup {
  id: number;
  name: string;
  topic: string;
  members: number;
}

/** What the live stream sends to the browser. */
export type ChatEvent =
  | { t: "message.new"; message: ChatMessage }
  /** An edit, a delete, or a new thread reply count. */
  | { t: "message.update"; message: ChatMessage }
  | { t: "reaction"; channelId: number; messageId: number; threadId: number | null; reactions: Reaction[] }
  | { t: "read"; channelId: number; userId: number; lastReadId: number }
  | { t: "typing"; channelId: number; userId: number; name: string }
  /** Renamed, archived, or people joined or left: re-read the list. */
  | { t: "channel.update"; channelId: number }
  | { t: "presence"; userId: number; status: PresenceStatus }
  /** A record changed (e.g. from a card button): cards showing it re-read it. */
  | { t: "card.refresh"; ref: string };

/** online = the portal is open; away = its tab has been in the background a while; dnd = do not disturb. */
export type PresenceStatus = "online" | "away" | "dnd" | "offline";

/** My chat settings. */
export interface ChatPrefsView {
  status: "auto" | "away" | "dnd";
  dndUntil: string | null;
  sound: boolean;
  desktop: boolean;
}
