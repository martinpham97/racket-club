import { Id } from "@/convex/_generated/dataModel";
import {
  AUTH_ACCESS_DENIED_ERROR,
  END_TIME_AFTER_START_ERROR,
  EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
  EVENT_DATE_FUTURE_ERROR,
  EVENT_DATE_RANGE_INVALID_ERROR,
  EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR,
  EVENT_END_DATE_AFTER_START_ERROR,
  EVENT_SERIES_DURATION_EXCEEDED_ERROR_TEMPLATE,
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
  EVENT_STATUS,
  EVENT_VISIBILITY,
  FEE_TYPE,
  MAX_EVENT_GENERATION_DATE_RANGE_DAYS,
  MAX_EVENT_SERIES_DURATION_MONTHS,
  MAX_EVENT_START_DATE_DAYS_FROM_NOW,
  MAX_PARTICIPANTS,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import {
  getClubMembershipForUser,
  getClubOrThrow,
  listAllClubMembers,
} from "@/convex/service/clubs/database";
import { Club, ClubMembership } from "@/convex/service/clubs/schemas";
import {
  Event,
  EventCreateInput,
  EventSchedule,
  EventSeries,
  EventSeriesCreateInput,
  EventSeriesUpdateInput,
  EventVisibility,
  TimeslotInput,
} from "@/convex/service/events/schemas";
import { getTimeDurationInMinutes } from "@/convex/service/utils/time";
import { QueryCtx } from "@/convex/types";
import { ConvexError } from "convex/values";
import { differenceInDays, differenceInMonths, isFuture } from "date-fns";
import format from "string-template";

/**
 * Validates event series for creation with club context and comprehensive error handling
 *
 * @param ctx - Query context
 * @param eventSeries - Event series input object containing recurrence, schedule, and visibility
 * @param club - Club object to validate against
 *
 * @throws {ConvexError} EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR - When private club tries to create public event
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
  const { schedule, startTime, endTime, timeslots, visibility } = eventSeries;
  validateEventVisibility(club, visibility);
  validateEventTime(startTime, endTime);
  validateRecurringSchedule(schedule);
  const clubMembers = await listAllClubMembers(ctx, club._id);
  validateEventTimeslots(startTime, endTime, timeslots, clubMembers);
};

/**
 * Validates single event for creation with club context
 * @param ctx - Query context
 * @param event - Event input object containing date, times, and visibility
 * @param club - Club object to validate against
 * @throws {ConvexError} EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR - When private club tries to create public event
 * @throws {ConvexError} END_TIME_AFTER_START_ERROR - When startTime is not before endTime
 * @throws {ConvexError} EVENT_DATE_FUTURE_ERROR - When date is not in the future
 * @throws {ConvexError} EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR - When date is too far in the future
 */
export const validateEventForCreate = async (
  ctx: QueryCtx,
  event: EventCreateInput,
  club: Club,
): Promise<void> => {
  const { date, startTime, endTime, timeslots, visibility } = event;
  validateEventVisibility(club, visibility);
  validateEventTime(startTime, endTime);
  validateEventDate(date);
  const clubMembers = await listAllClubMembers(ctx, club._id);
  validateEventTimeslots(startTime, endTime, timeslots, clubMembers);
};

/**
 * Validates event date is in future and not too far ahead
 * @param date - Event date as Unix timestamp
 * @throws {ConvexError} EVENT_DATE_FUTURE_ERROR - When date is not in the future
 * @throws {ConvexError} EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR - When date exceeds maximum allowed days from now
 */
export const validateEventDate = (date: number): void => {
  const now = Date.now();
  if (!isFuture(date)) {
    throw new ConvexError(EVENT_DATE_FUTURE_ERROR);
  }
  if (Math.abs(differenceInDays(now, date)) >= MAX_EVENT_START_DATE_DAYS_FROM_NOW) {
    throw new ConvexError(EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR);
  }
};

/**
 * Validates event visibility against club settings
 * @param club - Club object with isPublic property
 * @param eventVisibility - Desired event visibility level
 * @throws {ConvexError} When private club tries to create public event
 */
export const validateEventVisibility = (club: Club, eventVisibility: EventVisibility): void => {
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
  if (
    Math.abs(differenceInMonths(schedule.startDate, schedule.endDate)) >=
    MAX_EVENT_SERIES_DURATION_MONTHS
  ) {
    throw new ConvexError(
      format(EVENT_SERIES_DURATION_EXCEEDED_ERROR_TEMPLATE, {
        months: MAX_EVENT_SERIES_DURATION_MONTHS,
      }),
    );
  }
};

/**
 * Validates that start time is before end time
 * @param startTime - Event start time in HH:MM format
 * @param endTime - Event end time in HH:MM format
 * @throws {ConvexError} END_TIME_AFTER_START_ERROR - When startTime is not before endTime
 */
export const validateEventTime = (startTime: string, endTime: string): void => {
  if (startTime >= endTime) {
    throw new ConvexError(END_TIME_AFTER_START_ERROR);
  }
};

/**
 * Validates event timeslots against schedule and constraints
 * @param startTime - Event start time
 * @param endTime - Event end time
 * @param timeslots - Array of timeslots to validate
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
  startTime: string,
  endTime: string,
  timeslots: Array<TimeslotInput>,
  clubMembers: Array<ClubMembership>,
): void => {
  if (timeslots.length === 0) {
    throw new ConvexError(EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR);
  }

  const memberUserIds = new Set(clubMembers.map((m) => m.userId));

  timeslots.forEach((timeslotInput) => {
    if (timeslotInput.maxParticipants <= 0) {
      throw new ConvexError(EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR);
    }

    if (timeslotInput.feeType === FEE_TYPE.FIXED && !timeslotInput.fee) {
      throw new ConvexError(EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR);
    }

    switch (timeslotInput.type) {
      case TIMESLOT_TYPE.DURATION:
        if (!timeslotInput.duration) {
          throw new ConvexError(TIMESLOT_DURATION_REQUIRED_ERROR);
        }
        if (timeslotInput.duration > getTimeDurationInMinutes(startTime, endTime)) {
          throw new ConvexError(TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR);
        }
        break;
      case TIMESLOT_TYPE.START_END:
        if (!timeslotInput.startTime || !timeslotInput.endTime) {
          throw new ConvexError(TIMESLOT_START_END_REQUIRED_ERROR);
        }
        if (timeslotInput.startTime < startTime || timeslotInput.endTime > endTime) {
          throw new ConvexError(TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR);
        }
        validateEventTime(timeslotInput.startTime, timeslotInput.endTime);
        break;
    }

    if (timeslotInput.permanentParticipants.length > timeslotInput.maxParticipants) {
      throw new ConvexError(TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR);
    }

    const uniqueParticipants = new Set(timeslotInput.permanentParticipants);
    if (uniqueParticipants.size !== timeslotInput.permanentParticipants.length) {
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
 * @param club - Club object to validate against
 * @param existingSeries - Existing event series for merging data
 * @param eventSeriesUpdate - Partial event series update input
 */
export const validateEventSeriesForUpdate = async (
  ctx: QueryCtx,
  club: Club,
  existingEventSeries: EventSeries,
  eventSeriesUpdate: EventSeriesUpdateInput,
): Promise<void> => {
  const { schedule, timeslots, visibility, startTime, endTime } = eventSeriesUpdate;

  if (visibility) {
    validateEventVisibility(club, visibility);
  }

  const scheduleToUse: EventSchedule = { ...existingEventSeries.schedule, ...schedule };
  validateRecurringSchedule(scheduleToUse);

  const startTimeToUse = startTime || existingEventSeries.startTime;
  const endTimeToUse = endTime || existingEventSeries.endTime;
  validateEventTime(startTimeToUse, endTimeToUse);

  if (timeslots) {
    const clubMembers = await listAllClubMembers(ctx, club._id);
    validateEventTimeslots(startTimeToUse, endTimeToUse, timeslots, clubMembers);
  }
};

/**
 * Validates that a user can join or leave a event based on event status
 * @param event - Event to validate
 * @throws {ConvexError} EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR - When event has already started or completed
 */
export const validateEventStatusForJoinLeave = (event: Event) => {
  if (event.status !== EVENT_STATUS.NOT_STARTED) {
    throw new ConvexError(EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR);
  }
};

/**
 * Validates that a date range does not exceed 30 days.
 * @param data - Object containing fromDate and toDate timestamps
 * @returns true if the date range is within 30 days, false otherwise
 */
export const isEventDateRangeValid = (data: { fromDate: number; toDate: number }): boolean => {
  if (data.toDate < data.fromDate) {
    return false;
  }
  return differenceInDays(data.toDate, data.fromDate) <= MAX_EVENT_GENERATION_DATE_RANGE_DAYS;
};

/**
 * Validates that a date range does not exceed the maximum allowed days
 * @param fromDate - Start date timestamp
 * @param toDate - End date timestamp
 * @throws {ConvexError} EVENT_DATE_RANGE_INVALID_ERROR - When date range exceeds maximum allowed days
 */
export const validateEventDateRange = (fromDate: number, toDate: number): void => {
  if (!isEventDateRangeValid({ fromDate, toDate })) {
    throw new ConvexError(EVENT_DATE_RANGE_INVALID_ERROR);
  }
};

/**
 * Validates that a user has access to view an event based on visibility settings
 * @param ctx - Query context
 * @param event - Event to validate access for
 * @param userId - User ID requesting access
 * @throws {ConvexError} AUTH_ACCESS_DENIED_ERROR - When user lacks permission to access the event
 */
export const validateEventAccess = async (
  ctx: QueryCtx,
  event: Event,
  userId: Id<"users">,
): Promise<void> => {
  if (event.visibility === EVENT_VISIBILITY.PUBLIC) {
    return;
  }

  if (event.visibility === EVENT_VISIBILITY.MEMBERS_ONLY) {
    const club = await getClubOrThrow(ctx, event.clubId);
    const membership = await getClubMembershipForUser(ctx, club._id, userId);
    if (!membership) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }
  }
};
