// Time constants
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMIT_CONFIG = {
  // Profile update
  profileUpdate: {
    kind: "fixed window",
    period: DAY,
    rate: 5,
    capacity: 5,
  },
  // Joining a club
  joinClub: {
    kind: "fixed window",
    period: DAY,
    rate: 3,
    capacity: 3,
  },
  // Creating a club
  createClub: {
    kind: "fixed window",
    period: DAY,
    rate: 10,
    capacity: 10,
  },
  // Updating a club
  updateClub: {
    kind: "fixed window",
    period: DAY,
    rate: 20,
    capacity: 20,
  },
  // Updating a membership
  updateClubMembership: {
    kind: "fixed window",
    period: DAY,
    rate: 20,
    capacity: 20,
  },
} as const;
