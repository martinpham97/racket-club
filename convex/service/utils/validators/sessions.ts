import {
  END_TIME_AFTER_START_ERROR,
  SESSION_DATE_FUTURE_ERROR,
  SESSION_DATE_REQUIRED_ONE_TIME_ERROR,
  SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
  SESSION_DAY_OF_MONTH_REQUIRED_ERROR,
  SESSION_DAY_OF_WEEK_REQUIRED_ERROR,
  SESSION_END_DATE_AFTER_START_ERROR,
  SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
  SESSION_START_DATE_FUTURE_ERROR,
  SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
  TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
  TIMESLOT_DURATION_REQUIRED_ERROR,
  TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
  TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
  TIMESLOT_START_END_REQUIRED_ERROR,
  TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
} from "@/convex/constants/errors";
import {
  MAX_PARTICIPANTS,
  MAX_SESSION_START_DATE_DAYS_FROM_NOW,
  SESSION_RECURRENCE,
  SESSION_VISIBILITY,
  TIMESLOT_TYPE,
} from "@/convex/constants/sessions";
import { Club } from "@/convex/service/clubs/schemas";
import {
  SessionRecurrence,
  SessionSchedule,
  SessionTemplateCreateInput,
  SessionVisibility,
  TimeslotTemplate,
} from "@/convex/service/sessions/schemas";
import { getTimeDurationInMinutes } from "@/convex/service/utils/time";
import { ConvexError } from "convex/values";
import { differenceInDays } from "date-fns";

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
): void => {
  const { recurrence, schedule, timeslots, visibility } = sessionTemplate;
  validateSessionVisibility(club, visibility);
  validateSessionSchedule(schedule, recurrence);
  validateSessionTimeslots(schedule, timeslots);
};

export const validateSessionVisibility = (club: Club, sessionVisibility: SessionVisibility) => {
  if (!club.isPublic && sessionVisibility === SESSION_VISIBILITY.PUBLIC) {
    throw new ConvexError(SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR);
  }
};

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

export const validateSessionSchedule = (
  schedule: SessionSchedule,
  recurrence: SessionRecurrence,
): void => {
  if (schedule.startTime >= schedule.endTime) {
    throw new ConvexError(END_TIME_AFTER_START_ERROR);
  }

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
      break;

    case SESSION_RECURRENCE.DAILY:
      validateRecurringSchedule(schedule);
      break;

    case SESSION_RECURRENCE.WEEKLY:
      if (schedule.dayOfWeek === undefined) {
        throw new ConvexError(SESSION_DAY_OF_WEEK_REQUIRED_ERROR);
      }
      validateRecurringSchedule(schedule);
      break;

    case SESSION_RECURRENCE.MONTHLY:
      if (schedule.dayOfMonth === undefined) {
        throw new ConvexError(SESSION_DAY_OF_MONTH_REQUIRED_ERROR);
      }
      validateRecurringSchedule(schedule);
      break;
  }
};

export const validateSessionTimeslots = (
  schedule: SessionSchedule,
  timeslots: Array<TimeslotTemplate>,
): void => {
  timeslots.forEach((timeslotTemplate) => {
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
  });

  if (timeslots.reduce((acc, timeslot) => acc + timeslot.maxParticipants, 0) > MAX_PARTICIPANTS) {
    throw new ConvexError(TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR);
  }
};
