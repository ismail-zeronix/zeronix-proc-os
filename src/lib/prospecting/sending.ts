/** Sending-mailbox rules shared by the server and the browser: days, hours and the warm-up limit. */

export const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;
export type DayKey = (typeof DAYS)[number]["key"];

/** No mailbox sends more than this a day, whatever is typed in: more than this is how a new domain ends up in spam. */
export const HARD_MAX_PER_DAY = 80;

export interface RampInput {
  startCap: number;
  dailyCap: number;
  rampPerWeek: number;
  /** yyyy-mm-dd; null = warm-up not started, so the start limit applies. */
  warmupStartedOn: string | null;
}

/** Today's limit: the start limit plus the weekly step for every full week since warm-up began, up to the target. */
export function capOn(m: RampInput, today: string): number {
  const target = Math.min(m.dailyCap, HARD_MAX_PER_DAY);
  if (!m.warmupStartedOn) return Math.min(m.startCap, target);
  const weeks = Math.max(0, Math.floor((Date.parse(today) - Date.parse(m.warmupStartedOn)) / (7 * 86400_000)));
  return Math.min(target, m.startCap + weeks * m.rampPerWeek);
}

/** Weeks until the target limit is reached (0 when already there). */
export function weeksToTarget(m: RampInput, today: string): number {
  const now = capOn(m, today);
  const target = Math.min(m.dailyCap, HARD_MAX_PER_DAY);
  if (now >= target || m.rampPerWeek <= 0) return 0;
  return Math.ceil((target - now) / m.rampPerWeek);
}

export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
