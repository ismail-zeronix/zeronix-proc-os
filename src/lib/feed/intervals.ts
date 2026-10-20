/** Client-safe: the check intervals offered for live feeds, [minutes, label]. */
export const FEED_INTERVALS = [
  [5, "Every 5 minutes"],
  [15, "Every 15 minutes"],
  [30, "Every 30 minutes"],
  [60, "Every hour"],
  [180, "Every 3 hours"],
  [360, "Every 6 hours"],
  [720, "Every 12 hours"],
  [1440, "Once a day"],
] as const;

/** Client-safe: how often a started AI looks for waiting lists, [minutes, label]. */
export const AI_INTERVALS = [
  [1, "Every minute"],
  [5, "Every 5 minutes"],
  [10, "Every 10 minutes"],
  [15, "Every 15 minutes"],
  [30, "Every 30 minutes"],
  [60, "Every hour"],
  [180, "Every 3 hours"],
  [360, "Every 6 hours"],
] as const;
