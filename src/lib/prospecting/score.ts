/**
 * The prospect score, by rules (no AI): fit 40%, signal 40%, reachability 20%, each 0-10.
 * A good-fit company with nothing happening is a cold call; a signal with a date makes it a conversation.
 */

import { SIGNALS } from "./constants";

export interface ScoreInput {
  segmentKey: string | null;
  domain: string | null;
  emirate: string;
  sizeBand: string;
  /** Company inbox, e.g. info@. */
  email: string;
  phone: string;
  signals: { kind: string; observedOn: string }[];
  people: { roleKind: string; email: string; emailStatus: string; phone: string }[];
}

export interface Score {
  fit: number;
  signal: number;
  reach: number;
  total: number;
}

/** Below this a prospect is not worth a campaign. */
export const MIN_SCORE = 4;

const DAY = 86400_000;

export function fitScore(p: Pick<ScoreInput, "segmentKey" | "domain" | "emirate" | "sizeBand">): number {
  let s = p.segmentKey ? 6 : 3;
  if (p.domain) s += 2;
  if (p.emirate) s += 1;
  if (p.sizeBand) s += 1;
  return Math.min(10, s);
}

/** The strongest signal, worth less as it gets older (over 90 days -3, over 180 days -5). No signal = 2. */
export function signalScore(signals: ScoreInput["signals"], today: string): number {
  const now = Date.parse(today);
  let best = 2;
  for (const sig of signals) {
    const base = SIGNALS.find((k) => k.key === sig.kind)?.score ?? 4;
    const age = (now - Date.parse(sig.observedOn)) / DAY;
    const s = age > 180 ? base - 5 : age > 90 ? base - 3 : base;
    best = Math.max(best, s);
  }
  return Math.max(0, Math.min(10, best));
}

/** How directly we can reach the decision maker. */
export function reachScore(p: Pick<ScoreInput, "people" | "email" | "phone">): number {
  let best = p.email ? 3 : p.phone ? 2 : 1;
  for (const person of p.people) {
    const decides = person.roleKind === "decision";
    let s: number;
    if (person.email && person.emailStatus !== "generic") {
      if (decides) s = person.emailStatus === "verified" ? 8 : person.emailStatus === "likely" ? 7 : 6;
      else s = 4;
    } else s = person.email || person.phone ? 3 : decides ? 2 : 1;
    best = Math.max(best, s);
  }
  return best;
}

export interface ReadyInput {
  score: number;
  personalLine: string;
  people: { isPrimary: boolean; roleKind: string; email: string; emailStatus: string }[];
}

/**
 * What is still missing before the first email can go out: a key person (the main contact, or else a decision maker;
 * an agent or other staff member is not enough), their email (not a guess), the personal line and a score of at least
 * MIN_SCORE. Empty = ready; research moves a prospect to Ready by itself then.
 */
export function readyGaps(p: ReadyInput): string[] {
  const primary = p.people.find((x) => x.isPrimary) ?? p.people.find((x) => x.roleKind === "decision");
  return [
    !primary && "find the key person (owner or manager)",
    primary && !primary.email && "find their email",
    primary?.email && primary.emailStatus === "guess" && "confirm the guessed email",
    !p.personalLine && "write the personal line",
    p.score < MIN_SCORE && `raise the score above ${MIN_SCORE}`,
  ].filter(Boolean) as string[];
}

/** Statuses research may move on to Ready by itself (never out of a sequence, a snooze or a disqualification). */
export const AUTO_READY_FROM = ["sourced", "researching"];

export function scoreProspect(p: ScoreInput, today: string): Score {
  const fit = fitScore(p);
  const signal = signalScore(p.signals, today);
  const reach = reachScore(p);
  return { fit, signal, reach, total: Math.round((fit * 0.4 + signal * 0.4 + reach * 0.2) * 10) / 10 };
}
