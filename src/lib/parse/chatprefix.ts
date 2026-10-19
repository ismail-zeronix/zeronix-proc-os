const DATE = String.raw`(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?([APap])\.?[Mm]\.?)?`;

/**
 * The timestamp / sender WhatsApp puts in front of a message:
 * "19/10/2026, 10:32 - Name: text", "[19/10/2026, 10:32:15] Name: text", "[10:32, 19/10/2026] Name: text".
 * Capture groups: 1-3 date + 4-6 time (date first), or 7-9 time + 10-12 date (time first),
 * 13 sender (optional), 14 the rest of the line.
 */
export const CHAT_HEAD = new RegExp(
  String.raw`^[‎‏﻿]*\[?(?:${DATE},?\s+${TIME}|${TIME},?\s+${DATE})\]?\s*(?:-\s*)?(?:([^:\n]{1,60}?):\s)?(.*)$`,
);

/** Removes a leading WhatsApp timestamp / sender from one line. */
export function stripChatPrefix(line: string): string {
  const m = line.match(CHAT_HEAD);
  return m ? m[14].trim() : line;
}
