/**
 * How AI writes a cold first email: the prompt and the checks its answer must pass before anyone could send it.
 * Pure rules, no database, so they are easy to test.
 */

export interface WriteInput {
  /** What we offer and any notes on tone, from the campaign chat. */
  brief: string;
  /** Our company (from the admin email signature settings). */
  sender: string;
  company: string;
  industry: string;
  emirate: string;
  website: string;
  /** "Hi Sara" or "Hello Acme team": the email must start with it. */
  greeting: string;
  personName: string;
  personTitle: string;
  personalLine: string;
  /** Recent facts with a date, e.g. "Hiring: their careers page lists open positions". */
  signals: string[];
}

export function writePrompt(w: WriteInput): string {
  const facts = [
    `Company: ${w.company}`,
    w.industry && `Industry: ${w.industry}`,
    w.emirate && `Location: ${w.emirate}, UAE`,
    w.website && `Website: ${w.website}`,
    w.personName && `Writing to: ${w.personName}${w.personTitle ? `, ${w.personTitle}` : ""}`,
    w.personalLine && `Something specific about them: ${w.personalLine}`,
    ...w.signals.map((s) => `Recent: ${s}`),
  ].filter(Boolean);
  return [
    `Write a short, personal first sales email from ${w.sender || "our company"} (UAE) to the company below.`,
    "",
    "WHAT WE OFFER AND HOW TO WRITE:",
    w.brief.trim(),
    "",
    "ABOUT THEM:",
    ...facts,
    "",
    "RULES:",
    `- Start the body with exactly "${w.greeting}," on its own line.`,
    "- 60 to 110 words, plain text, short paragraphs. Friendly and direct, like one person writing to another.",
    w.personalLine || w.signals.length
      ? "- Mention one specific thing about them (from the facts above) and link it to what we offer for their industry."
      : "- We know nothing specific about them beyond the facts above: speak to what companies in their industry and area usually need. Do not claim to know their properties, projects, size or plans.",
    "- End with one easy question (for example a short call this week), then \"Best regards,\" as the last line. No name or signature after it; it is added automatically.",
    "- Never invent facts, prices, clients or numbers. No links, no placeholders like [Name], no emojis, no ALL CAPS, no exclamation marks.",
    "- Subject: 3 to 7 words, plain, no clickbait.",
    'Reply with JSON only, no other text: {"subject":"","body":""}',
  ].join("\n");
}

export interface WrittenEmail {
  subject: string;
  body: string;
}

/** The email inside a model's reply, cleaned, or null with the reason it cannot be used. */
export function checkEmail(reply: string, greeting: string): { email: WrittenEmail } | { problem: string } {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  let raw: { subject?: unknown; body?: unknown } | null = null;
  if (start >= 0 && end > start) {
    try {
      raw = JSON.parse(reply.slice(start, end + 1));
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw.subject !== "string" || typeof raw.body !== "string") return { problem: "the reply was not the JSON asked for" };
  const subject = raw.subject.replace(/\s+/g, " ").trim().replace(/^subject:\s*/i, "");
  const body = raw.body
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const words = body.split(/\s+/).length;
  if (subject.length < 3 || subject.length > 120) return { problem: "the subject is missing or too long" };
  if (words < 30 || words > 220) return { problem: `the email is ${words} words (30 to 220 allowed)` };
  if (/\[[^\]]*\]|\{[^}]*\}|<[^>]+>/.test(`${subject} ${body}`)) return { problem: "it has placeholders or tags left in it" };
  if (/https?:\/\/|www\./i.test(body)) return { problem: "it has links in it" };
  return { email: { subject, body: layout(body, greeting) } };
}

/**
 * Puts an email in the same shape whatever the model sent: our greeting (right name, or "<company> team" for an inbox;
 * a model's own guess is replaced), the text in paragraphs, the closing question on its own, and "Best regards," last.
 */
export function layout(body: string, greeting: string): string {
  let text = body.trim();
  const first = text.match(/^(hi|hello|dear|good (morning|afternoon))\b[^\n,]{0,50},?/i);
  if (first) text = text.slice(first[0].length).trim();
  text = text.replace(/\s*(best regards|kind regards|warm regards|regards|sincerely)[,.!]?\s*$/i, "").trim();
  // one long block: give the closing question its own paragraph
  if (!text.includes("\n")) {
    const m = text.match(/^([\s\S]*[.!])\s+([^.!?]*\?)$/);
    if (m) text = `${m[1]}\n\n${m[2]}`;
  }
  return `${greeting},\n\n${text}\n\nBest regards,`;
}

/** The follow-ups a campaign chat can add, sent in the same thread when there is no reply. */
export const FOLLOW_UPS = [
  { delayDays: 3, body: "{greeting},\n\nJust bringing this back to the top of your inbox in case it got buried. Would a short call this week be useful?\n\nBest regards," },
  { delayDays: 5, body: "{greeting},\n\nI don't want to keep filling your inbox, so this is my last note. If {offer_line} is ever on your list, just reply to this email and I will get back to you the same day.\n\nBest regards," },
];

/** The first email used when AI cannot write one: it still needs the personal line to be filled in Review. */
export const FALLBACK_FIRST = "{greeting},\n\n{personal_line}\n\nWe help companies like {company} with {offer_line}. Would a short call this week be useful to see if it fits?\n\nBest regards,";
