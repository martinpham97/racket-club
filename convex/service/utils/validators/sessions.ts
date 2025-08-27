import {
  END_TIME_AFTER_START_ERROR,
  SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
  SESSION_DATE_FUTURE_ERROR,
  SESSION_DATE_REQUIRED_ONE_TIME_ERROR,
  SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
  SESSION_DAY_OF_MONTH_REQUIRED_ERROR,
  SESSION_DAY_OF_WEEK_REQUIRED_ERROR,
  SESSION_END_DATE_AFTER_START_ERROR,
  SESSION_INVALID_PARAMETER_FOR_RECURRENCE_ERROR_TEMPLATE,
  SESSION_INVALID_RECURRENCE_ERROR,
  SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
  SESSION_START_DATE_FUTURE_ERROR,
  SESSION_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
  SESSION_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
  SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
  SESSION_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
  SESSION_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
  SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
  TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
  TIMESLOT_DURATION_REQUIRED_ERROR,
  TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
  TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
  TIMESLOT_START_END_REQUIRED_ERROR,
  TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
} from "@/convex/constants/errors";
import {
  FEE_TYPE,
  MAX_PARTICIPANTS,
  MAX_SESSION_START_DATE_DAYS_FROM_NOW,
  SESSION_RECURRENCE,
  SESSION_STATUS,
  SESSION_VISIBILITY,
  TIMESLOT_TYPE,
} from "@/convex/constants/sessions";
import { Club, ClubMembership } from "@/convex/service/clubs/schemas";
import {
  SessionInstance,
  SessionRecurrence,
  SessionSchedule,
  SessionTemplateCreateInput,
  SessionVisibility,
  TimeslotTemplate,
} from "@/convex/service/sessions/schemas";
import { getTimeDurationInMinutes } from "@/convex/service/utils/time";
import { ConvexError } from "convex/values";
import { differenceInDays } from "date-fns";
import format from "string-template";

/**
 * Validates session template with club context and comprehensive error handling
 *
 * @param sessionTemplate - Session template input object containing recurrence, schedule, and visibility
 * @param club - Club object to validate against
 *
 * @throws {ConvexError} SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR - When private club tries to create public session
 * @throws {ConvexError} SESSION_SCHEDULE_REQUIRED_ERROR - When schedule object is missing
 * @throws {ConvexError} END_TIME_AFTER_START_ERROR - When session startTime is not before endTime
 *
 * **ONE_TIME Sessions:**
 * @throws {ConvexError} SESSION_DATE_REQUIRED_ONE_TIME_ERROR - When date field is undefined
 * @throws {ConvexError} SESSION_DATE_FUTURE_ERROR - When date is not in the future
 *
 * **DAILY Sessions:**
 * @throws {ConvexError} SESSION_START_DATE_REQUIRED_DAILY_ERROR - When startDate is undefined
 * @throws {ConvexError} SESSION_END_DATE_REQUIRED_DAILY_ERROR - When endDate is undefined
 * @throws {ConvexError} SESSION_START_DATE_FUTURE_ERROR - When startDate is not in the future
 * @throws {ConvexError} SESSION_END_DATE_AFTER_START_ERROR - When endDate is not after startDate
 *
 * **WEEKLY Sessions:**
 * @throws {ConvexError} SESSION_START_DATE_REQUIRED_WEEKLY_ERROR - When startDate is undefined
 * @throws {ConvexError} SESSION_END_DATE_REQUIRED_WEEKLY_ERROR - When endDate is undefined
 * @throws {ConvexError} SESSION_DAY_OF_WEEK_REQUIRED_ERROR - When dayOfWeek (0-6) is undefined
 * @throws {ConvexError} SESSION_START_DATE_FUTURE_ERROR - When startDate is not in the future
 * @throws {ConvexError} SESSION_END_DATE_AFTER_START_ERROR - When endDate is not after startDate
 *
 * **MONTHLY Sessions:**
 * @throws {ConvexError} SESSION_START_DATE_REQUIRED_MONTHLY_ERROR - When startDate is undefined
 * @throws {ConvexError} SESSION_END_DATE_REQUIRED_MONTHLY_ERROR - When endDate is undefined
 * @throws {ConvexError} SESSION_DAY_OF_MONTH_REQUIRED_ERROR - When dayOfMonth (1-31) is undefined
 * @throws {ConvexError} SESSION_START_DATE_FUTURE_ERROR - When startDate is not in the future
 * @throws {ConvexError} SESSION_END_DATE_AFTER_START_ERROR - When endDate is not after startDate
 *
 * @throws {ConvexError} SESSION_INVALID_RECURRENCE_ERROR - When recurrence type is not recognized
 *
 * **Visibility Rules:**
 * - Private clubs cannot create public sessions
 * - Public clubs can create sessions with any visibility level
 *
 * @example
 * ```typescript
 * const publicClub = { isPublic: true };
 * const privateClub = { isPublic: false };
 *
 * // Valid - public club creating public session
 * validateSessionTemplate({
 *   recurrence: SESSION_RECURRENCE.WEEKLY,
 *   visibility: SESSION_VISIBILITY.PUBLIC,
 *   schedule: { startTime: "18:00", endTime: "20:00", dayOfWeek: 1 }
 * }, publicClub);
 *
 * // Invalid - private club creating public session (throws error)
 * validateSessionTemplate({
 *   visibility: SESSION_VISIBILITY.PUBLIC
 * }, privateClub);
 * ```
 */
export const validateSessionTemplate = (
  sessionTemplate: SessionTemplateCreateInput,
  club: Club,
  clubMembers: Array<ClubMembership>,
): void => {
  const { recurrence, schedule, timeslots, visibility } = sessionTemplate;
  validateSessionVisibility(club, visibility);
  validateSessionSchedule(schedule, recurrence);
  validateSessionTimeslots(schedule, timeslots, clubMembers);
};

/**
 * Validates session visibility against club settings
 * @param club - Club object with isPublic property
 * @param sessionVisibility - Desired session visibility level
 * @throws {ConvexError} When private club tries to create public session
 */
export const validateSessionVisibility = (club: Club, sessionVisibility: SessionVisibility) => {
  if (!club.isPublic && sessionVisibility === SESSION_VISIBILITY.PUBLIC) {
    throw new ConvexError(SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR);
  }
};

/**
 * Validates recurring session schedule dates
 * @param schedule - Session schedule with startDate and endDate
 * @throws {ConvexError} When startDate or endDate missing, dates invalid, or too far in future
 */
export const validateRecurringSchedule = (schedule: SessionSchedule): void => {
  if (schedule.startDate === undefined || schedule.endDate === undefined) {
    throw new ConvexError(SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR);
  }
  const now = Date.now();
  if (schedule.startDate <= now) {
    throw new ConvexError(SESSION_START_DATE_FUTURE_ERROR);
  }
  if (schedule.endDate <= schedule.startDate) {
    throw new ConvexError(SESSION_END_DATE_AFTER_START_ERROR);
  }
  if (Math.abs(differenceInDays(now, schedule.startDate)) >= MAX_SESSION_START_DATE_DAYS_FROM_NOW) {
    throw new ConvexError(SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR);
  }
};

/**
 * Validates session schedule based on recurrence type
 * @param schedule - Session schedule object with times and dates
 * @param recurrence - Type of recurrence (ONE_TIME, DAILY, WEEKLY, MONTHLY)
 * @throws {ConvexError} Various errors based on recurrence type and missing/invalid fields
 */
export const validateSessionSchedule = (
  schedule: SessionSchedule,
  recurrence: SessionRecurrence,
): void => {
  if (schedule.startTime >= schedule.endTime) {
    throw new ConvexError(END_TIME_AFTER_START_ERROR);
  }

  const throwUnnecessaryParameterError = (parameter: string, recurrence: string): void => {
    throw new ConvexError(
      format(SESSION_INVALID_PARAMETER_FOR_RECURRENCE_ERROR_TEMPLATE, { parameter, recurrence }),
    );
  };

  const now = Date.now();

  switch (recurrence) {
    case SESSION_RECURRENCE.ONE_TIME:
      if (schedule.date === undefined) {
        throw new ConvexError(SESSION_DATE_REQUIRED_ONE_TIME_ERROR);
      }
      if (schedule.date <= now) {
        throw new ConvexError(SESSION_DATE_FUTURE_ERROR);
      }
      if (Math.abs(differenceInDays(now, schedule.date)) >= MAX_SESSION_START_DATE_DAYS_FROM_NOW) {
        throw new ConvexError(SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR);
      }
      if (schedule.startDate !== undefined) throwUnnecessaryParameterError("startDate", "one-time");
      if (schedule.endDate !== undefined) throwUnnecessaryParameterError("endDate", "one-time");
      if (schedule.dayOfWeek !== undefined) throwUnnecessaryParameterError("dayOfWeek", "one-time");
      if (schedule.dayOfMonth !== undefined)
        throwUnnecessaryParameterError("dayOfMonth", "one-time");
      break;

    case SESSION_RECURRENCE.DAILY:
      validateRecurringSchedule(schedule);
      if (schedule.date !== undefined) throwUnnecessaryParameterError("date", "daily");
      if (schedule.dayOfWeek !== undefined) throwUnnecessaryParameterError("dayOfWeek", "daily");
      if (schedule.dayOfMonth !== undefined) throwUnnecessaryParameterError("dayOfMonth", "daily");
      break;

    case SESSION_RECURRENCE.WEEKLY:
      if (schedule.dayOfWeek === undefined) {
        throw new ConvexError(SESSION_DAY_OF_WEEK_REQUIRED_ERROR);
      }
      validateRecurringSchedule(schedule);
      if (schedule.date !== undefined) throwUnnecessaryParameterError("date", "weekly");
      if (schedule.dayOfMonth !== undefined) throwUnnecessaryParameterError("dayOfMonth", "weekly");
      break;

    case SESSION_RECURRENCE.MONTHLY:
      if (schedule.dayOfMonth === undefined) {
        throw new ConvexError(SESSION_DAY_OF_MONTH_REQUIRED_ERROR);
      }
      validateRecurringSchedule(schedule);
      if (schedule.date !== undefined) throwUnnecessaryParameterError("date", "monthly");
      if (schedule.dayOfWeek !== undefined) throwUnnecessaryParameterError("dayOfWeek", "monthly");
      break;
    default:
      throw new ConvexError(SESSION_INVALID_RECURRENCE_ERROR);
  }
};

/**
 * Validates session timeslots against schedule and constraints
 * @param schedule - Session schedule for time range validation
 * @param timeslots - Array of timeslot templates to validate
 * @param clubMembers - Array of club memberships
 * @throws {ConvexError} SESSION_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR - When no timeslots provided
 * @throws {ConvexError} SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR - When maxParticipants <= 0
 * @throws {ConvexError} SESSION_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR - When feeType is FIXED but fee is missing
 * @throws {ConvexError} TIMESLOT_DURATION_REQUIRED_ERROR - When duration type timeslot missing duration
 * @throws {ConvexError} TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR - When duration exceeds schedule time range
 * @throws {ConvexError} TIMESLOT_START_END_REQUIRED_ERROR - When start/end type timeslot missing times
 * @throws {ConvexError} TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR - When timeslot times outside schedule range
 * @throws {ConvexError} END_TIME_AFTER_START_ERROR - When timeslot startTime >= endTime
 * @throws {ConvexError} TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR - When permanent participants exceed maxParticipants
 * @throws {ConvexError} SESSION_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR - When permanent participants contain duplicates
 * @throws {ConvexError} SESSION_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR - When permanent participant is not a club member
 * @throws {ConvexError} TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR - When total participants across all timeslots exceed limit
 */
export const validateSessionTimeslots = (
  schedule: SessionSchedule,
  timeslots: Array<TimeslotTemplate>,
  clubMembers: Array<ClubMembership>,
): void => {
  if (timeslots.length === 0) {
    throw new ConvexError(SESSION_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR);
  }

  const memberUserIds = new Set(clubMembers.map((m) => m.userId));

  timeslots.forEach((timeslotTemplate) => {
    if (timeslotTemplate.maxParticipants <= 0) {
      throw new ConvexError(SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR);
    }

    if (timeslotTemplate.feeType === FEE_TYPE.FIXED && !timeslotTemplate.fee) {
      throw new ConvexError(SESSION_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR);
    }

    switch (timeslotTemplate.type) {
      case TIMESLOT_TYPE.DURATION:
        if (!timeslotTemplate.duration) {
          throw new ConvexError(TIMESLOT_DURATION_REQUIRED_ERROR);
        }
        if (
          timeslotTemplate.duration > getTimeDurationInMinutes(schedule.startTime, schedule.endTime)
        ) {
          throw new ConvexError(TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR);
        }
        break;
      case TIMESLOT_TYPE.START_END:
        if (!timeslotTemplate.startTime || !timeslotTemplate.endTime) {
          throw new ConvexError(TIMESLOT_START_END_REQUIRED_ERROR);
        }
        if (
          timeslotTemplate.startTime < schedule.startTime ||
          timeslotTemplate.endTime > schedule.endTime
        ) {
          throw new ConvexError(TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR);
        }
        if (timeslotTemplate.startTime >= timeslotTemplate.endTime) {
          throw new ConvexError(END_TIME_AFTER_START_ERROR);
        }
        break;
    }

    if (timeslotTemplate.permanentParticipants.length > timeslotTemplate.maxParticipants) {
      throw new ConvexError(TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR);
    }

    const uniqueParticipants = new Set(timeslotTemplate.permanentParticipants);
    if (uniqueParticipants.size !== timeslotTemplate.permanentParticipants.length) {
      throw new ConvexError(SESSION_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR);
    }

    if (![...uniqueParticipants].every((userId) => memberUserIds.has(userId))) {
      throw new ConvexError(SESSION_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR);
    }
  });

  if (timeslots.reduce((acc, timeslot) => acc + timeslot.maxParticipants, 0) > MAX_PARTICIPANTS) {
    throw new ConvexError(TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR);
  }
};

/**
 * Validates that a user can join or leave a session based on session status
 * @param session - Session instance to validate
 * @throws {ConvexError} SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR - When session has already started or completed
 */
export const validateSessionStatusForJoinLeave = (session: SessionInstance) => {
  if (session.status !== SESSION_STATUS.NOT_STARTED) {
    throw new ConvexError(SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR);
  }
};
