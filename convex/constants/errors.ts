import { MAX_PARTICIPANTS, MIN_PARTICIPANTS } from "./events";

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

export const EVENT_ALREADY_JOINED_ERROR = "You have already joined this event.";

export const EVENT_ALREADY_STARTED_ERROR = "This event has already started.";

export const EVENT_BANNED_USER_ERROR = "You are banned from this club and cannot join events.";

export const EVENT_DUPLICATE_JOIN_ERROR = "Cannot join the same event twice.";

export const EVENT_DUPLICATE_LEAVE_ERROR = "Cannot leave the same event twice.";

export const EVENT_FULL_ERROR = "This event is full.";

export const EVENT_GRACE_TIME_EXPIRED_ERROR =
  "Grace time has expired. You cannot leave this event.";

export const EVENT_INVALID_SCHEDULE_ERROR = "Invalid event schedule.";

export const EVENT_LEVEL_MISMATCH_ERROR = "Your skill level does not match the event requirements.";

export const EVENT_NOT_FOUND_ERROR = "This event does not exist.";

export const EVENT_NOT_JOINED_ERROR = "You have not joined this event.";

export const EVENT_UNAUTHORIZED_ERROR = "You are not authorized to manage this event.";

export const EVENT_VISIBILITY_ERROR = "You cannot access this event.";

export const EVENT_DATE_FUTURE_ERROR = "Date must be in the future.";
export const EVENT_DAY_OF_MONTH_REQUIRED_ERROR = "Day of month is required for monthly events.";
export const EVENT_DAY_OF_WEEK_REQUIRED_ERROR = "Day of week is required for weekly events.";
export const EVENT_END_DATE_AFTER_START_ERROR = "End date must be after start date.";
export const EVENT_INVALID_RECURRENCE_ERROR = "Invalid event recurrence setting.";
export const EVENT_SCHEDULE_REQUIRED_ERROR = "Schedule is required.";
export const EVENT_START_DATE_FUTURE_ERROR = "Start date must be in the future.";

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
  "Timeslot duration must be within the event's time range.";

export const TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR =
  "Total max participants for all timeslots exceeds maximum 100 participants per event.";

export const TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR =
  "The number of participants for this timeslot cannot exceed the timeslot maximum participants.";

export const TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR =
  "Timeslot time range must be within the event's time range.";

export const EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR =
  "Event visibility cannot be public as this club is a private club.";

export const EVENT_GENERATION_WINDOW_ERROR =
  "Target date is outside the allowed generation window.";
export const EVENT_ALREADY_EXISTS_ERROR = "Event already exists for this date.";
export const EVENT_RECURRENCE_MISMATCH_ERROR =
  "Target date does not match series recurrence pattern.";
export const EVENT_SERIES_INACTIVE_ERROR = "Event series is not active for the target date.";

export const EVENT_INVALID_TIMEZONE_ERROR = "Invalid time zone specified.";

export const DB_ITEM_NOT_FOUND_ERROR_TEMPLATE = "{item} could not be found or does not exist.";

export const EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR =
  "Unable to generate events due to inactive status.";

export const EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR =
  "Unable to join or leave event as it has already started or been cancelled.";

export const EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR =
  "Event starting date is too far in the future. Please keep the event starting date within 30 days from now.";

export const EVENT_INVALID_PARAMETER_FOR_RECURRENCE_ERROR_TEMPLATE =
  "{parameter} is not allowed for {recurrence} events.";

export const EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR =
  "Recurring events require start date and end date.";

export const EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR = "At least one timeslot is required.";

export const EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR = `Fee is required when charging a fixed amount.`;

export const EVENT_TIMESLOT_FULL_ERROR = "This event timeslot is full and waitlist is also full.";

export const EVENT_TIMESLOT_INVALID_ID_ERROR = "Invalid timeslot ID provided.";

export const EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR = `Max participants must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}.`;

export const EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR =
  "Every permanent participant must be a club member.";

export const EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR =
  "Permanent participants must be unique.";
