import { MAX_PARTICIPANTS, MIN_PARTICIPANTS } from "./sessions";

export const AUTH_ACCESS_DENIED_ERROR = "You do not have access to perform this action.";

export const AUTH_PROVIDER_NO_EMAIL_ERROR =
  "Unable to login due to no email provided by the authentication provider.";

export const AUTH_UNAUTHENTICATED_ERROR = "You must be signed in to perform this action.";

export const USER_PROFILE_ALREADY_EXISTS_ERROR = "Profile already exists.";

export const USER_PROFILE_DOB_IN_FUTURE_ERROR = "Date of birth cannot be in the future.";

export const USER_PROFILE_DOB_INVALID_ERROR = "Invalid date of birth.";

export const USER_PROFILE_REQUIRED_ERROR =
  "Profile not found! Please create a profile to continue.";

export const RATE_LIMIT_REACHED_ERROR_TEMPLATE =
  "Looks like you're sending too many requests. Try again after {retryAfter}.";

export const CLUB_CANNOT_BAN_OWNER_ERROR = "You cannot ban the club owner.";

export const CLUB_CANNOT_BAN_SELF_ERROR = "You cannot ban yourself.";

export const CLUB_FULL_ERROR = "You cannot join this club. This club has reached its max capacity.";

export const CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR = "You are already a member of this club.";

export const CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR = "You cannot remove the club owner.";

export const CLUB_MEMBERSHIP_NOT_FOUND_ERROR = "This club member does not exist.";

export const CLUB_MEMBERSHIP_REQUIRED_ERROR =
  "You must be a member of this club to perform this action.";

export const CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR =
  "All memberships must belong to the same club.";

export const CLUB_NOT_FOUND_ERROR = "This club does not exist.";

export const CLUB_OWNER_CANNOT_LEAVE_ERROR =
  "You cannot leave this club as you are the club owner.";

export const CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR =
  "A public club with the same name already exists. Please consider renaming your club or create a private club.";

export const CLUB_PUBLIC_UNAPPROVED_ERROR =
  "You cannot join this club. This public club has not yet been approved.";

export const CLUB_USER_BANNED_ERROR = "You are banned from this club.";

export const CLUB_USER_NOT_BANNED_ERROR = "This user is not banned from the club.";

export const SESSION_ALREADY_JOINED_ERROR = "You have already joined this session.";

export const SESSION_ALREADY_STARTED_ERROR = "This session has already started.";

export const SESSION_BANNED_USER_ERROR = "You are banned from this club and cannot join sessions.";

export const SESSION_DUPLICATE_JOIN_ERROR = "Cannot join the same session twice.";

export const SESSION_DUPLICATE_LEAVE_ERROR = "Cannot leave the same session twice.";

export const SESSION_FULL_ERROR = "This session is full.";

export const SESSION_GRACE_TIME_EXPIRED_ERROR =
  "Grace time has expired. You cannot leave this session.";

export const SESSION_INVALID_SCHEDULE_ERROR = "Invalid session schedule.";

export const SESSION_LEVEL_MISMATCH_ERROR =
  "Your skill level does not match the session requirements.";

export const SESSION_NOT_FOUND_ERROR = "This session does not exist.";

export const SESSION_NOT_JOINED_ERROR = "You have not joined this session.";

export const SESSION_UNAUTHORIZED_ERROR = "You are not authorized to manage this session.";

export const SESSION_VISIBILITY_ERROR = "You cannot access this session.";

export const SESSION_DATE_FUTURE_ERROR = "Date must be in the future.";
export const SESSION_DATE_REQUIRED_ONE_TIME_ERROR = "Date is required for one-time sessions.";
export const SESSION_DAY_OF_MONTH_REQUIRED_ERROR = "Day of month is required for monthly sessions.";
export const SESSION_DAY_OF_WEEK_REQUIRED_ERROR = "Day of week is required for weekly sessions.";
export const SESSION_END_DATE_AFTER_START_ERROR = "End date must be after start date.";
export const SESSION_INVALID_RECURRENCE_ERROR = "Invalid session recurrence setting.";
export const SESSION_SCHEDULE_REQUIRED_ERROR = "Schedule is required.";
export const SESSION_START_DATE_FUTURE_ERROR = "Start date must be in the future.";

export const TIMESLOT_DURATION_REQUIRED_ERROR = "Duration is required for duration-type timeslots.";
export const TIMESLOT_START_END_REQUIRED_ERROR =
  "Start time and end time are required for start/end-type timeslots.";
export const TIMESLOT_TYPE_INVALID_ERROR = "Invalid timeslot type.";

export const END_TIME_AFTER_START_ERROR = "End time must be after start time.";

export const TIME_FORMAT_ERROR =
  "Time must be in HH:MM format (24-hour). Minutes must be in 15-minute intervals (00, 15, 30, 45).";

export const TIMESLOT_DURATION_MORE_THAN_24_HOURS_ERROR =
  "Timeslot duration must be under 24 hours.";
export const TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR =
  "Timeslot duration must be within the session's time range.";

export const TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR =
  "Total max participants for all timeslots exceeds maximum 100 participants per session.";

export const TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR =
  "The number of participants for this timeslot cannot exceed the timeslot maximum participants.";

export const TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR =
  "Timeslot time range must be within the session's time range.";

export const SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR =
  "Session visibility cannot be public as this club is a private club.";

export const SESSION_GENERATION_WINDOW_ERROR =
  "Target date is outside the allowed generation window.";
export const SESSION_INSTANCE_ALREADY_EXISTS_ERROR =
  "Session instance already exists for this date.";
export const SESSION_RECURRENCE_MISMATCH_ERROR =
  "Target date does not match template recurrence pattern.";
export const SESSION_TEMPLATE_DISABLED_ERROR = "Session template is disabled or cancelled.";
export const SESSION_TEMPLATE_INACTIVE_ERROR =
  "Session template is not active for the target date.";

export const SESSION_INVALID_TIMEZONE_ERROR = "Invalid time zone specified.";

export const DB_ITEM_NOT_FOUND_ERROR_TEMPLATE = "{item} could not be found or does not exist.";

export const SESSION_CANNOT_GENERATE_INSTANCE_DUE_TO_INACTIVE_STATUS_ERROR =
  "Unable to generate sessions due to inactive status.";

export const SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR =
  "Unable to join or leave session as it has already started or been cancelled.";

export const SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR =
  "Session starting date is too far in the future. Please keep the session starting date within 30 days from now.";

export const SESSION_INVALID_PARAMETER_FOR_RECURRENCE_ERROR_TEMPLATE =
  "{parameter} is not allowed for {recurrence} sessions.";

export const SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR =
  "Recurring sessions require start date and end date.";

export const SESSION_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR = "At least one timeslot is required.";

export const SESSION_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR = `Fee is required when charging a fixed amount.`;

export const SESSION_TIMESLOT_FULL_ERROR =
  "This session timeslot is full and waitlist is also full.";

export const SESSION_TIMESLOT_INVALID_ID_ERROR = "Invalid timeslot ID provided.";

export const SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR = `Max participants must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}.`;

export const SESSION_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR =
  "Every permanent participant must be a club member.";

export const SESSION_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR =
  "Permanent participants must be unique.";
