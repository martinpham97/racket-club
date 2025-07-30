// Time constants
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMIT_CONFIG = {
  // Profile update limits
  profileUpdate: {
    kind: "fixed window",
    period: SECOND,
    rate: 5,
    capacity: 5,
  },
} as const;
