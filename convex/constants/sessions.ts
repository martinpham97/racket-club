export const SESSION_RECURRENCE = {
  ONE_TIME: "one_time",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export const SESSION_TYPE = {
  SOCIAL: "social",
  TRAINING: "training",
} as const;

export const SESSION_STATUS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const SESSION_VISIBILITY = {
  MEMBERS_ONLY: "members_only",
  PUBLIC: "public",
} as const;

export const TIMESLOT_TYPE = {
  DURATION: "duration",
  START_END: "start_end",
} as const;

export const FEE_TYPE = {
  SPLIT: "split",
  FIXED: "fixed",
} as const;

export const DISCOUNT_TYPE = {
  USER: "user",
  GENDER: "gender",
  SKILL_LEVEL: "skill_level",
  CLUB_MEMBER: "club_member",
} as const;

export const PENALTY_TYPE = {
  FIXED: "fixed",
  DEFAULT_FEE: "default_fee",
} as const;

export const PAYMENT_TYPE = {
  CASH: "cash",
} as const;

export const MAX_SESSION_NAME_LENGTH = 100;
export const MAX_SESSION_DESCRIPTION_LENGTH = 300;
export const MAX_TIMESLOT_NAME_LENGTH = 100;
export const MAX_DISCOUNT_DESCRIPTION_LENGTH = 300;
export const MAX_DISCOUNTS = 10;
export const MIN_PARTICIPANTS = 1;
export const MAX_PARTICIPANTS = 100;
export const MIN_WAITLIST = 0;
export const MAX_WAITLIST = 50;
export const MIN_GRACE_TIME_HOURS = 1;
export const MAX_GRACE_TIME_HOURS = 168; // 1 week
export const MAX_SESSION_DURATION_HOURS = 24;
export const MAX_END_DATE_MONTHS = 12;
export const MAX_SESSION_START_DATE_DAYS_FROM_NOW = 30;
export const MAX_GENERATED_SESSIONS_FOR_RECURRENCE = {
  [SESSION_RECURRENCE.DAILY]: 7,
  [SESSION_RECURRENCE.WEEKLY]: 4,
  [SESSION_RECURRENCE.MONTHLY]: 4,
  [SESSION_RECURRENCE.ONE_TIME]: 1,
};

export const TIME_FORMAT_REGEX = /^([0-1][0-9]|2[0-3]):(00|15|30|45)$/;
