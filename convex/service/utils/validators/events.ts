import { QueryCtx } from "@/convex/_generated/server";
import {
  END_TIME_AFTER_START_ERROR,
  EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
  EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR,
  EVENT_DAY_OF_MONTH_REQUIRED_ERROR,
  EVENT_DAY_OF_WEEK_REQUIRED_ERROR,
  EVENT_END_DATE_AFTER_START_ERROR,
  EVENT_INVALID_PARAMETER_FOR_RECURRENCE_ERROR_TEMPLATE,
  EVENT_INVALID_RECURRENCE_ERROR,
  EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR,
  EVENT_START_DATE_FUTURE_ERROR,
  EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
  EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
  EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
  EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
  EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
  EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
  TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
  TIMESLOT_DURATION_REQUIRED_ERROR,
  TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
  TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
  TIMESLOT_START_END_REQUIRED_ERROR,
  TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
} from "@/convex/constants/errors";
import {
  EVENT_RECURRENCE,
  EVENT_STATUS,
  EVENT_VISIBILITY,
  FEE_TYPE,
  MAX_EVENT_START_DATE_DAYS_FROM_NOW,
  MAX_PARTICIPANTS,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import { listAllClubMembers } from "@/convex/service/clubs/database";
import { Club, ClubMembership } from "@/convex/service/clubs/schemas";
import {
  Event,
  EventRecurrence,
  EventSchedule,
  EventSeries,
  EventSeriesCreateInput,
  EventSeriesUpdateInput,
  EventVisibility,
  TimeslotSeries,
} from "@/convex/service/events/schemas";
import { getTimeDurationInMinutes } from "@/convex/service/utils/time";
import { ConvexError } from "convex/values";
import { differenceInDays } from "date-fns";
import format from "string-template";

/**
 * Validates event series for creation with club context and comprehensive error handling
 *
 * @param ctx - Query context
 * @param eventSeries - Event series input object containing recurrence, schedule, and visibility
 * @param club - Club object to validate against
 *
 * @throws {ConvexError} EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR - When private club tries to create public event
 * @throws {ConvexError} EVENT_SCHEDULE_REQUIRED_ERROR - When schedule object is missing
 * @throws {ConvexError} END_TIME_AFTER_START_ERROR - When event startTime is not before endTime
 *
 * **DAILY Events:**
 * @throws {ConvexError} EVENT_START_DATE_REQUIRED_DAILY_ERROR - When startDate is undefined
 * @throws {ConvexError} EVENT_END_DATE_REQUIRED_DAILY_ERROR - When endDate is undefined
 * @throws {ConvexError} EVENT_START_DATE_FUTURE_ERROR - When startDate is not in the future
 * @throws {ConvexError} EVENT_END_DATE_AFTER_START_ERROR - When endDate is not after startDate
 *
 * **WEEKLY Events:**
 * @throws {ConvexError} EVENT_START_DATE_REQUIRED_WEEKLY_ERROR - When startDate is undefined
 * @throws {ConvexError} EVENT_END_DATE_REQUIRED_WEEKLY_ERROR - When endDate is undefined
 * @throws {ConvexError} EVENT_DAY_OF_WEEK_REQUIRED_ERROR - When dayOfWeek (0-6) is undefined
 * @throws {ConvexError} EVENT_START_DATE_FUTURE_ERROR - When startDate is not in the future
 * @throws {ConvexError} EVENT_END_DATE_AFTER_START_ERROR - When endDate is not after startDate
 *
 * **MONTHLY Events:**
 * @throws {ConvexError} EVENT_START_DATE_REQUIRED_MONTHLY_ERROR - When startDate is undefined
 * @throws {ConvexError} EVENT_END_DATE_REQUIRED_MONTHLY_ERROR - When endDate is undefined
 * @throws {ConvexError} EVENT_DAY_OF_MONTH_REQUIRED_ERROR - When dayOfMonth (1-31) is undefined
 * @throws {ConvexError} EVENT_START_DATE_FUTURE_ERROR - When startDate is not in the future
 * @throws {ConvexError} EVENT_END_DATE_AFTER_START_ERROR - When endDate is not after startDate
 *
 * @throws {ConvexError} EVENT_INVALID_RECURRENCE_ERROR - When recurrence type is not recognized
 *
 * **Visibility Rules:**
 * - Private clubs cannot create public events
 * - Public clubs can create events with any visibility level
 *
 * @example
 * ```typescript
 * const publicClub = { isPublic: true };
 * const privateClub = { isPublic: false };
 *
 * // Valid - public club creating public event
 * validateEventSeriesForCreate({
 *   recurrence: EVENT_RECURRENCE.WEEKLY,
 *   visibility: EVENT_VISIBILITY.PUBLIC,
 *   schedule: { startTime: "18:00", endTime: "20:00", dayOfWeek: 1 }
 * }, publicClub);
 *
 * // Invalid - private club creating public event (throws error)
 * validateEventSeriesForCreate({
 *   visibility: EVENT_VISIBILITY.PUBLIC
 * }, privateClub);
 * ```
 */
export const validateEventSeriesForCreate = async (
  ctx: QueryCtx,
  eventSeries: EventSeriesCreateInput,
  club: Club,
): Promise<void> => {
  const { recurrence, schedule, timeslots, visibility } = eventSeries;
  validateEventVisibility(club, visibility);
  validateEventSchedule(schedule, recurrence);
  const clubMembers = await listAllClubMembers(ctx, club._id);
  validateEventTimeslots(schedule, timeslots, clubMembers);
};

/**
 * Validates event visibility against club settings
 * @param club - Club object with isPublic property
 * @param eventVisibility - Desired event visibility level
 * @throws {ConvexError} When private club tries to create public event
 */
export const validateEventVisibility = (club: Club, eventVisibility: EventVisibility) => {
  if (!club.isPublic && eventVisibility === EVENT_VISIBILITY.PUBLIC) {
    throw new ConvexError(EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR);
  }
};

/**
 * Validates recurring event schedule dates
 * @param schedule - Event schedule with startDate and endDate
 * @throws {ConvexError} When startDate or endDate missing, dates invalid, or too far in future
 */
export const validateRecurringSchedule = (schedule: EventSchedule): void => {
  if (schedule.startDate === undefined || schedule.endDate === undefined) {
    throw new ConvexError(EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR);
  }
  const now = Date.now();
  if (schedule.startDate <= now) {
    throw new ConvexError(EVENT_START_DATE_FUTURE_ERROR);
  }
  if (schedule.endDate <= schedule.startDate) {
    throw new ConvexError(EVENT_END_DATE_AFTER_START_ERROR);
  }
  if (Math.abs(differenceInDays(now, schedule.startDate)) >= MAX_EVENT_START_DATE_DAYS_FROM_NOW) {
    throw new ConvexError(EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR);
  }
};

/**
 * Validates event schedule based on recurrence type
 * @param schedule - Event schedule object with times and dates
 * @param recurrence - Type of recurrence (DAILY, WEEKLY, MONTHLY)
 * @throws {ConvexError} Various errors based on recurrence type and missing/invalid fields
 */
export const validateEventSchedule = (
  schedule: EventSchedule,
  recurrence: EventRecurrence,
): void => {
  if (schedule.startTime >= schedule.endTime) {
    throw new ConvexError(END_TIME_AFTER_START_ERROR);
  }

  const throwUnnecessaryParameterError = (parameter: string, recurrence: string): void => {
    throw new ConvexError(
      format(EVENT_INVALID_PARAMETER_FOR_RECURRENCE_ERROR_TEMPLATE, { parameter, recurrence }),
    );
  };

  // const now = Date.now();

  switch (recurrence) {
    // case EVENT_RECURRENCE.ONE_TIME:
    //   if (schedule.date === undefined) {
    //     throw new ConvexError(EVENT_DATE_REQUIRED_ONE_TIME_ERROR);
    //   }
    //   if (schedule.date <= now) {
    //     throw new ConvexError(EVENT_DATE_FUTURE_ERROR);
    //   }
    //   if (Math.abs(differenceInDays(now, schedule.date)) >= MAX_EVENT_START_DATE_DAYS_FROM_NOW) {
    //     throw new ConvexError(EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR);
    //   }
    //   if (schedule.startDate ) throwUnnecessaryParameterError("startDate", "one-time");
    //   if (schedule.endDate ) throwUnnecessaryParameterError("endDate", "one-time");
    //   if (schedule.dayOfWeek ) throwUnnecessaryParameterError("dayOfWeek", "one-time");
    //   if (schedule.dayOfMonth )
    //     throwUnnecessaryParameterError("dayOfMonth", "one-time");
    //   break;

    case EVENT_RECURRENCE.DAILY:
      validateRecurringSchedule(schedule);
      if (schedule.dayOfWeek) throwUnnecessaryParameterError("dayOfWeek", "daily");
      if (schedule.dayOfMonth) throwUnnecessaryParameterError("dayOfMonth", "daily");
      break;

    case EVENT_RECURRENCE.WEEKLY:
      if (schedule.dayOfWeek === undefined) {
        throw new ConvexError(EVENT_DAY_OF_WEEK_REQUIRED_ERROR);
      }
      validateRecurringSchedule(schedule);
      if (schedule.dayOfMonth) throwUnnecessaryParameterError("dayOfMonth", "weekly");
      break;

    case EVENT_RECURRENCE.MONTHLY:
      if (schedule.dayOfMonth === undefined) {
        throw new ConvexError(EVENT_DAY_OF_MONTH_REQUIRED_ERROR);
      }
      validateRecurringSchedule(schedule);
      if (schedule.dayOfWeek) throwUnnecessaryParameterError("dayOfWeek", "monthly");
      break;
    default:
      throw new ConvexError(EVENT_INVALID_RECURRENCE_ERROR);
  }
};

/**
 * Validates event timeslots against schedule and constraints
 * @param schedule - Event schedule for time range validation
 * @param timeslots - Array of timeslot seriess to validate
 * @param clubMembers - Array of club memberships
 * @throws {ConvexError} EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR - When no timeslots provided
 * @throws {ConvexError} EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR - When maxParticipants <= 0
 * @throws {ConvexError} EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR - When feeType is FIXED but fee is missing
 * @throws {ConvexError} TIMESLOT_DURATION_REQUIRED_ERROR - When duration type timeslot missing duration
 * @throws {ConvexError} TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR - When duration exceeds schedule time range
 * @throws {ConvexError} TIMESLOT_START_END_REQUIRED_ERROR - When start/end type timeslot missing times
 * @throws {ConvexError} TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR - When timeslot times outside schedule range
 * @throws {ConvexError} END_TIME_AFTER_START_ERROR - When timeslot startTime >= endTime
 * @throws {ConvexError} TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR - When permanent participants exceed maxParticipants
 * @throws {ConvexError} EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR - When permanent participants contain duplicates
 * @throws {ConvexError} EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR - When permanent participant is not a club member
 * @throws {ConvexError} TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR - When total participants across all timeslots exceed limit
 */
export const validateEventTimeslots = (
  schedule: EventSchedule,
  timeslots: Array<TimeslotSeries>,
  clubMembers: Array<ClubMembership>,
): void => {
  if (timeslots.length === 0) {
    throw new ConvexError(EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR);
  }

  const memberUserIds = new Set(clubMembers.map((m) => m.userId));

  timeslots.forEach((timeslotSeries) => {
    if (timeslotSeries.maxParticipants <= 0) {
      throw new ConvexError(EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR);
    }

    if (timeslotSeries.feeType === FEE_TYPE.FIXED && !timeslotSeries.fee) {
      throw new ConvexError(EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR);
    }

    switch (timeslotSeries.type) {
      case TIMESLOT_TYPE.DURATION:
        if (!timeslotSeries.duration) {
          throw new ConvexError(TIMESLOT_DURATION_REQUIRED_ERROR);
        }
        if (
          timeslotSeries.duration > getTimeDurationInMinutes(schedule.startTime, schedule.endTime)
        ) {
          throw new ConvexError(TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR);
        }
        break;
      case TIMESLOT_TYPE.START_END:
        if (!timeslotSeries.startTime || !timeslotSeries.endTime) {
          throw new ConvexError(TIMESLOT_START_END_REQUIRED_ERROR);
        }
        if (
          timeslotSeries.startTime < schedule.startTime ||
          timeslotSeries.endTime > schedule.endTime
        ) {
          throw new ConvexError(TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR);
        }
        if (timeslotSeries.startTime >= timeslotSeries.endTime) {
          throw new ConvexError(END_TIME_AFTER_START_ERROR);
        }
        break;
    }

    if (timeslotSeries.permanentParticipants.length > timeslotSeries.maxParticipants) {
      throw new ConvexError(TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR);
    }

    const uniqueParticipants = new Set(timeslotSeries.permanentParticipants);
    if (uniqueParticipants.size !== timeslotSeries.permanentParticipants.length) {
      throw new ConvexError(EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR);
    }

    if (![...uniqueParticipants].every((userId) => memberUserIds.has(userId))) {
      throw new ConvexError(EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR);
    }
  });

  if (timeslots.reduce((acc, timeslot) => acc + timeslot.maxParticipants, 0) > MAX_PARTICIPANTS) {
    throw new ConvexError(TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR);
  }
};

/**
 * Validates event series update with club context and partial validation
 * @param ctx - Query context
 * @param eventSeriesUpdate - Partial event series update input
 * @param club - Club object to validate against
 * @param existingSeries - Existing event series for merging data
 */
export const validateEventSeriesForUpdate = async (
  ctx: QueryCtx,
  eventSeriesUpdate: EventSeriesUpdateInput,
  club: Club,
  existingEventSeries: EventSeries,
): Promise<void> => {
  const { recurrence, schedule, timeslots, visibility } = eventSeriesUpdate;

  if (visibility) {
    validateEventVisibility(club, visibility);
  }

  if (schedule && recurrence) {
    validateEventScheduleForUpdate(schedule, recurrence, existingEventSeries.schedule);
  }

  if (timeslots) {
    const clubMembers = await listAllClubMembers(ctx, club._id);
    const scheduleToUse = schedule || existingEventSeries.schedule;
    validateEventTimeslots(scheduleToUse, timeslots, clubMembers);
  }
};

/**
 * Validates event schedule for updates with partial data
 * @param schedule - Partial event schedule update
 * @param recurrence - Event recurrence type
 * @param existingSchedule - Existing schedule for merging
 */
export const validateEventScheduleForUpdate = (
  schedule: Partial<EventSchedule>,
  recurrence: EventRecurrence,
  existingSchedule: EventSchedule,
): void => {
  const fullSchedule = { ...existingSchedule, ...schedule };

  if (schedule.startTime && schedule.endTime) {
    if (schedule.startTime >= schedule.endTime) {
      throw new ConvexError(END_TIME_AFTER_START_ERROR);
    }
  }

  const now = Date.now();

  switch (recurrence) {
    // case EVENT_RECURRENCE.ONE_TIME:
    //   if (schedule.date  && schedule.date <= now) {
    //     throw new ConvexError(EVENT_DATE_FUTURE_ERROR);
    //   }
    //   break;

    case EVENT_RECURRENCE.DAILY:
    case EVENT_RECURRENCE.WEEKLY:
    case EVENT_RECURRENCE.MONTHLY:
      if (schedule.startDate && schedule.startDate <= now) {
        throw new ConvexError(EVENT_START_DATE_FUTURE_ERROR);
      }
      if (
        fullSchedule.startDate &&
        fullSchedule.endDate &&
        fullSchedule.endDate <= fullSchedule.startDate
      ) {
        throw new ConvexError(EVENT_END_DATE_AFTER_START_ERROR);
      }
      break;
  }
};

/**
 * Validates that a user can join or leave a event based on event status
 * @param event - Event instance to validate
 * @throws {ConvexError} EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR - When event has already started or completed
 */
export const validateEventStatusForJoinLeave = (event: Event) => {
  if (event.status !== EVENT_STATUS.NOT_STARTED) {
    throw new ConvexError(EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR);
  }
};
