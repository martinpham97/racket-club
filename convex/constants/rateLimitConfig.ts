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
  // Bulk operations - more restrictive
  bulkApproveMembers: {
    kind: "fixed window",
    period: HOUR,
    rate: 10,
    capacity: 10,
  },
  bulkRemoveMembers: {
    kind: "fixed window",
    period: HOUR,
    rate: 5,
    capacity: 5,
  },
  // Banning/unbanning - very restrictive
  banMember: {
    kind: "fixed window",
    period: DAY,
    rate: 5,
    capacity: 5,
  },
  unbanMember: {
    kind: "fixed window",
    period: DAY,
    rate: 10,
    capacity: 10,
  },
  // Creating an event
  createEvent: {
    kind: "fixed window",
    period: DAY,
    rate: 10,
    capacity: 10,
  },
  // Updating an event
  updateEvent: {
    kind: "fixed window",
    period: DAY,
    rate: 20,
    capacity: 20,
  },
  // Joining an event
  joinEvent: {
    kind: "fixed window",
    period: DAY,
    rate: 10,
    capacity: 10,
  },
  // Leaving an event
  leaveEvent: {
    kind: "fixed window",
    period: DAY,
    rate: 10,
    capacity: 10,
  },
} as const;
