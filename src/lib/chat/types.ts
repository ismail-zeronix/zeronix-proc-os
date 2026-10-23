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
  /** For a DM, the other person's name. */
  name: string;
  /** For a DM, the other person. */
  peer: ChatUser | null;
  members: ChatUser[];
  lastMessageAt: string | null;
  lastPreview: string;
  lastFrom: string | null;
  lastFromId: number | null;
  unread: number;
  muted: boolean;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  userId: number | null;
  userName: string | null;
  kind: MessageKind;
  body: string;
  card: ChatCard | null;
  replyToId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** What the live stream sends to the browser. */
export type ChatEvent =
  | { t: "message.new"; message: ChatMessage }
  | { t: "read"; channelId: number; userId: number; lastReadId: number }
  | { t: "channel.update"; channelId: number }
  | { t: "presence"; userId: number; online: boolean };
