import { internal } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_USER_BANNED_ERROR,
  EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR,
  EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR,
  EVENT_TIMESLOT_FULL_ERROR,
  EVENT_TIMESLOT_INVALID_ID_ERROR,
} from "@/convex/constants/errors";
import {
  EVENT_RECURRENCE,
  EVENT_STATUS,
  EVENT_VISIBILITY,
  MAX_GENERATED_EVENTS_FOR_RECURRENCE,
} from "@/convex/constants/events";
import { getClubBanRecordForUser, getClubMembershipForUser } from "@/convex/service/clubs/database";
import { Club } from "@/convex/service/clubs/schemas";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
} from "@/convex/service/utils/functions";
import { paginatedResult } from "@/convex/service/utils/pagination";
import { getStartOfDayInTimezone, getUtcTimestampForDate } from "@/convex/service/utils/time";
import { enforceClubOwnershipOrAdmin } from "@/convex/service/utils/validators/clubs";
import {
  validateEventForCreate,
  validateEventSeriesForCreate,
  validateEventSeriesForUpdate,
  validateEventStatusForJoinLeave,
} from "@/convex/service/utils/validators/events";
import { getOrThrow } from "convex-helpers/server/relationships";
import { convexToZod, withSystemFields, zid, zodToConvex } from "convex-helpers/server/zod";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { addDays, addMonths, addWeeks } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import z from "zod";
import {
  createEvent as dtoCreateEvent,
  createEventSeries as dtoCreateEventSeries,
  getEventAtDate as dtoGetEventAtDate,
  listAllEventParticipants as dtoListAllEventParticipants,
  listEventParticipationsForUser as dtoListEventParticipationsForUser,
  listEventSeriesForClub as dtoListEventSeriesForClub,
  listEventsForClub as dtoListEventsForClub,
  listParticipatingEvents as dtoListParticipatingEvents,
  searchEvents as dtoSearchEvents,
  updateEventSeries as dtoUpdateEventSeries,
} from "./database";
import {
  Event,
  eventCreateInputSchema,
  eventFiltersSchema,
  EventParticipant,
  eventParticipantSchema,
  eventSchema,
  EventSeries,
  EventSeriesCreateInput,
  eventSeriesCreateInputSchema,
  eventSeriesSchema,
  eventSeriesUpdateInputSchema,
  eventStatusSchema,
  Timeslot,
} from "./schemas";

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Retrieves a event series with permission validation
 * @param eventSeriesId - ID of the event series to retrieve
 * @returns Event series with all properties
 * @throws {ConvexError} When series not found or access denied
 */
export const getEventSeries = authenticatedQueryWithRLS()({
  args: { eventSeriesId: zid("eventSeries") },
  returns: z.object(withSystemFields("eventSeries", eventSeriesSchema.shape)),
  handler: async (ctx, args) => {
    const eventSeries = await getOrThrow(ctx, args.eventSeriesId);
    const club = await getOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    return eventSeries;
  },
});

/**
 * Lists event seriess for a specific club
 * @param clubId - ID of the club to list seriess for
 * @param pagination - Pagination options
 * @returns Paginated list of event seriess
 * @throws {ConvexError} When club not found or access denied
 */
export const listEventSeries = authenticatedQueryWithRLS()({
  args: { clubId: zid("clubs"), pagination: convexToZod(paginationOptsValidator) },
  returns: paginatedResult(z.object(withSystemFields("eventSeries", eventSeriesSchema.shape))),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    return await dtoListEventSeriesForClub(ctx, args.clubId, args.pagination);
  },
});

/**
 * Retrieves a event with its participants
 * @param eventId - ID of the event to retrieve
 * @returns Event and list of participants
 * @throws {ConvexError} When not found or access denied
 */
export const getEvent = authenticatedQueryWithRLS()({
  args: { eventId: zid("events") },
  returns: {
    event: z.object(withSystemFields("events", eventSchema.shape)),
    participants: z.array(
      z.object(withSystemFields("eventParticipants", eventParticipantSchema.shape)),
    ),
  },
  handler: async (ctx, args) => {
    const event = await getOrThrow(ctx, args.eventId);
    const participants = await dtoListAllEventParticipants(ctx, args.eventId);
    if (!participants.find((p) => p.userId === ctx.currentUser._id)) {
      await validateEventAccess(ctx, event, ctx.currentUser._id);
    }
    return { event, participants };
  },
});

/**
 * Lists events for a specific club within a date range
 * @param clubId - ID of the club to list events for
 * @param filters - Date range filters (fromDate, toDate)
 * @param pagination - Pagination options
 * @returns Paginated list of events
 * @throws {ConvexError} When club not found or user not a member
 */
export const listClubEvents = authenticatedQueryWithRLS()({
  args: {
    clubId: zid("clubs"),
    filters: z.object({
      fromDate: z.number(),
      toDate: z.number(),
    }),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { clubId, filters, pagination } = args;
    // TODO: validate date range is within 1 month
    await getOrThrow(ctx, clubId);
    const userMembership = await getClubMembershipForUser(ctx, clubId, ctx.currentUser._id);
    if (!userMembership) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }
    return await dtoListEventsForClub(ctx, clubId, filters, pagination);
  },
});

/**
 * Lists events where the current user is participating
 * @param filters - Date range filters (fromDate, toDate)
 * @param pagination - Pagination options
 * @returns Paginated list of events user is participating in
 */
export const listMyEvents = authenticatedQueryWithRLS()({
  args: {
    filters: z.object({
      fromDate: z.number(),
      toDate: z.number(),
    }),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { filters, pagination } = args;
    // TODO: validate date range is within 1 month
    return await dtoListParticipatingEvents(ctx, ctx.currentUser._id, filters, pagination);
  },
});

/**
 * Searches for events based on query and filters
 * @param query - Optional text search query
 * @param filters - Search filters (date range, clubs, skill level, location)
 * @param pagination - Pagination options
 * @returns Paginated list of matching events
 */
export const searchEvents = authenticatedQueryWithRLS()({
  args: {
    query: z.string().optional(),
    filters: eventFiltersSchema,
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { query, filters, pagination } = args;

    // TODO: validate date range is within 1 month
    const userMemberClubIds = await getUserMemberClubIds(ctx, ctx.currentUser._id);
    return await dtoSearchEvents(ctx, query, filters, userMemberClubIds, pagination);
  },
});

// ============================================================================
// MUTATION FUNCTIONS
// ============================================================================

/**
 * Creates a new event series with automatic generation
 * @param input - Event series configuration data
 * @returns ID of the created event series
 * @throws {ConvexError} When validation fails or access denied
 */
export const createEventSeries = authenticatedMutationWithRLS()({
  args: { input: eventSeriesCreateInputSchema },
  returns: zid("eventSeries"),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.input.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventSeriesForCreate(ctx, args.input, club);

    const eventSeriesId = await dtoCreateEventSeries(ctx, args.input, ctx.currentUser._id);

    await scheduleEventSeriesDeactivation(ctx, eventSeriesId, args.input);
    await ctx.runMutation(internal.service.events.functions._createEvents, {
      eventSeriesId: eventSeriesId,
      startDate: args.input.schedule.startDate!,
    });

    return eventSeriesId;
  },
});

/**
 * Updates an existing event series
 * @param eventSeriesId - ID of the event series to update
 * @param input - Partial event series data to update
 * @throws {ConvexError} When series not found or access denied
 */
export const updateEventSeries = authenticatedMutationWithRLS()({
  args: { eventSeriesId: zid("eventSeries"), input: eventSeriesUpdateInputSchema },
  returns: z.null(),
  handler: async (ctx, args) => {
    const eventSeries = await getOrThrow(ctx, args.eventSeriesId);
    const club = await getOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventSeriesForUpdate(ctx, club, eventSeries, args.input);

    await dtoUpdateEventSeries(ctx, args.eventSeriesId, args.input);

    return null;
  },
});

/**
 * Deletes an existing event series
 * @param eventSeriesId - ID of the event series to delete
 * @throws {ConvexError} When series not found or access denied
 */
export const deleteEventSeries = authenticatedMutationWithRLS()({
  args: { eventSeriesId: zid("eventSeries") },
  returns: z.null(),
  handler: async (ctx, args) => {
    const eventSeries = await getOrThrow(ctx, args.eventSeriesId);
    const club = await getOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);

    await ctx.db.delete(args.eventSeriesId);

    return null;
  },
});

/**
 * Creates a new event
 * @param input - Event configuration data
 * @returns ID of the created event
 * @throws {ConvexError} When validation fails or access denied
 */
export const createEvent = authenticatedMutationWithRLS()({
  args: { input: eventCreateInputSchema },
  returns: zid("events"),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.input.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventForCreate(ctx, args.input, club);
    const eventId = await dtoCreateEvent(ctx, ctx.currentUser._id, args.input);
    return eventId;
  },
});

/**
 * Generates events for an active event series
 * @param eventSeriesId - ID of the event series
 * @param startDate - Start date for generation
 * @param endDate - End date for generation
 * @returns Array of generated event IDs
 * @throws {ConvexError} When series inactive or access denied
 */
export const generateEvents = authenticatedMutationWithRLS()({
  args: { eventSeriesId: zid("eventSeries"), startDate: z.number(), endDate: z.number() },
  returns: { eventIds: z.array(zid("events")) },
  handler: async (ctx, args): Promise<{ eventIds: Id<"events">[] }> => {
    const { eventSeriesId, startDate, endDate } = args;
    const eventSeries = await getOrThrow(ctx, eventSeriesId);
    const club = await getOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);

    if (!eventSeries.isActive) {
      throw new ConvexError(EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR);
    }

    return await ctx.runMutation(internal.service.events.functions._createEvents, {
      eventSeriesId,
      startDate,
      endDate,
    });
  },
});

/**
 * Joins a user to a event timeslot
 * @param eventId - ID of the event
 * @param timeslotId - ID of the timeslot to join
 * @returns ID of the participation record
 * @throws {ConvexError} When event full, user banned, or invalid request
 */
export const joinEvent = authenticatedMutationWithRLS()({
  args: { eventId: zid("events"), timeslotId: z.string() },
  returns: zid("eventParticipants"),
  handler: async (ctx, args): Promise<Id<"eventParticipants">> => {
    const event = await getOrThrow(ctx, args.eventId);
    const club = await getOrThrow(ctx, event.clubId);

    const existingParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.eventId,
      ctx.currentUser._id,
      args.timeslotId,
    );

    if (existingParticipation) {
      return existingParticipation._id;
    }

    await validateJoinability(ctx, club, event, ctx.currentUser._id);
    const timeslot = getTimeslotOrThrow(event, args.timeslotId);
    const isWaitlisted = shouldUserBeWaitlisted(timeslot);

    return await ctx.db.insert("eventParticipants", {
      userId: ctx.currentUser._id,
      joinedAt: Date.now(),
      eventId: args.eventId,
      timeslotId: args.timeslotId,
      isWaitlisted,
      date: event.date,
    });
  },
});

/**
 * Removes a user from a event timeslot
 * @param eventId - ID of the event
 * @param timeslotId - ID of the timeslot to leave
 * @throws {ConvexError} When user not participating or event already started
 */
export const leaveEvent = authenticatedMutationWithRLS()({
  args: { eventId: zid("events"), timeslotId: z.string() },
  returns: z.null(),
  handler: async (ctx, args): Promise<null> => {
    const event = await getOrThrow(ctx, args.eventId);
    const timeslot = getTimeslotOrThrow(event, args.timeslotId);

    const userParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.eventId,
      ctx.currentUser._id,
      args.timeslotId,
    );

    if (!userParticipation) {
      return null;
    }

    // Validate event status
    validateEventStatusForJoinLeave(event);

    await ctx.db.delete(userParticipation._id);
    await promoteWaitlistedParticipant(ctx, args.eventId, args.timeslotId, timeslot);

    return null;
  },
});

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Creates events for a series within a date range
 * @internal
 */

export const _createEvents = internalMutation({
  args: {
    eventSeriesId: v.id("eventSeries"),
    startDate: v.number(),
    endDate: v.optional(v.number()),
  },
  returns: { eventIds: v.array(v.id("events")) },
  handler: async (ctx, { eventSeriesId, startDate, endDate }) => {
    const series = await getOrThrow(ctx, eventSeriesId);
    const dates = generateUpcomingEventDates(series, startDate, endDate);

    const eventIds = await Promise.all(
      dates.map(async (date) => {
        const eventId = await createEventFromSeries(ctx, series, date);
        if (eventId) {
          const event = await getOrThrow(ctx, eventId);
          await insertPermanentParticipants(ctx, event);
          await scheduleStatusTransitions(ctx, series, eventId, date);
        }
        return eventId;
      }),
    );

    await scheduleNextBatch(ctx, eventSeriesId, dates);
    return { eventIds };
  },
});

/**
 * Updates event status
 * @internal
 */
export const _updateEventStatus = internalMutation({
  args: {
    eventId: v.id("events"),
    status: zodToConvex(eventStatusSchema),
  },
  handler: async (ctx, { eventId, status }) => {
    await ctx.db.patch(eventId, { status });
  },
});

/**
 * Deactivates a event series
 * @internal
 */
export const _deactivateEventSeries = internalMutation({
  args: {
    eventSeriesId: v.id("eventSeries"),
  },
  handler: async (ctx, { eventSeriesId }) => {
    await ctx.db.patch(eventSeriesId, { isActive: false });
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a event from a series for a specific date
 */
const createEventFromSeries = async (
  ctx: MutationCtx,
  series: EventSeries,
  date: number,
): Promise<Id<"events">> => {
  const existing = await dtoGetEventAtDate(ctx, series._id, date);
  if (existing) {
    console.warn(`Event for ${new Date(date).toDateString()} already exists.`);
    return existing._id;
  }
  const eventInput = { ...eventCreateInputSchema.parse(series), date };
  return await dtoCreateEvent(ctx, series.createdBy, eventInput, series._id);
};

/**
 * Schedules automatic status transitions for a event
 */
const scheduleStatusTransitions = async (
  ctx: MutationCtx,
  series: EventSeries,
  eventId: Id<"events">,
  date: number,
): Promise<void> => {
  const startTime = getUtcTimestampForDate(series.startTime, series.location.timezone, date);
  const endTime = getUtcTimestampForDate(series.endTime, series.location.timezone, date);

  await Promise.all([
    ctx.scheduler.runAt(startTime, internal.service.events.functions._updateEventStatus, {
      eventId,
      status: EVENT_STATUS.IN_PROGRESS,
    }),
    ctx.scheduler.runAt(endTime, internal.service.events.functions._updateEventStatus, {
      eventId,
      status: EVENT_STATUS.COMPLETED,
    }),
  ]);
};

/**
 * Generates upcoming event dates based on series recurrence pattern
 */
const generateUpcomingEventDates = (
  series: EventSeries,
  startDate: number,
  endDate?: number,
): number[] => {
  if (!startDate || !series.schedule.endDate) {
    throw new ConvexError(EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR);
  }

  const finalEndDate = endDate
    ? Math.min(endDate, series.schedule.endDate)
    : series.schedule.endDate;

  const dates: number[] = [];
  const startDateInTz = toZonedTime(startDate, series.location.timezone);
  const endDateInTz = toZonedTime(finalEndDate, series.location.timezone);
  const maxEvents = MAX_GENERATED_EVENTS_FOR_RECURRENCE[series.recurrence] || 0;

  for (let i = 0; i < maxEvents; i++) {
    const eventDateInTz = calculateNextEventDate(series.recurrence, startDateInTz, i);
    if (!eventDateInTz || eventDateInTz > endDateInTz) break;

    const eventDateUtc = fromZonedTime(eventDateInTz, series.location.timezone);
    dates.push(eventDateUtc.getTime());
  }

  return dates;
};

/**
 * Adds permanent participants to a event
 */
const insertPermanentParticipants = async (
  ctx: MutationCtx,
  event: Event,
): Promise<Array<Id<"eventParticipants">>> => {
  const participants = event.timeslots.flatMap((timeslot) =>
    timeslot.permanentParticipants.map(
      async (userId) =>
        await ctx.db.insert("eventParticipants", {
          userId,
          joinedAt: event.date,
          eventId: event._id,
          timeslotId: timeslot.id,
          isWaitlisted: false,
          date: event.date,
        }),
    ),
  );
  return Promise.all(participants);
};

/**
 * Validates event visibility permissions for a user
 */
const validateEventAccess = async (
  ctx: QueryCtx,
  event: Event,
  userId: Id<"users">,
): Promise<void> => {
  if (event.visibility === EVENT_VISIBILITY.PUBLIC) {
    return;
  }

  if (event.visibility === EVENT_VISIBILITY.MEMBERS_ONLY) {
    const club = await getOrThrow(ctx, event.clubId);
    const membership = await getClubMembershipForUser(ctx, club._id, userId);
    if (!membership) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }
  }
};

/**
 * Gets club IDs where user is a member
 */
const getUserMemberClubIds = async (ctx: QueryCtx, userId: Id<"users">): Promise<Id<"clubs">[]> => {
  const memberships = await ctx.db
    .query("clubMemberships")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  return memberships.map((m) => m.clubId);
};

/**
 * Schedules series deactivation at end date
 */
const scheduleEventSeriesDeactivation = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  input: EventSeriesCreateInput,
): Promise<void> => {
  const deactivationDate = input.schedule.endDate;
  if (!deactivationDate) {
    return;
  }
  const endDateInTimezone = getStartOfDayInTimezone(deactivationDate, input.location.timezone);
  await ctx.scheduler.runAt(
    endDateInTimezone.getTime(),
    internal.service.events.functions._deactivateEventSeries,
    { eventSeriesId: seriesId },
  );
};

/**
 * Validates join permissions (ban status, visibility, event status)
 */
const validateJoinability = async (
  ctx: MutationCtx,
  club: Club,
  event: Event,
  userId: Id<"users">,
): Promise<void> => {
  const ban = await getClubBanRecordForUser(ctx, club._id, userId);
  if (ban) {
    throw new ConvexError(CLUB_USER_BANNED_ERROR);
  }

  await validateEventAccess(ctx, event, userId);
  validateEventStatusForJoinLeave(event);
};

/**
 * Validates and returns timeslot
 */
const getTimeslotOrThrow = (event: Event, timeslotId: string): Timeslot => {
  const timeslot = event.timeslots.find((ts) => ts.id === timeslotId);
  if (!timeslot) {
    throw new ConvexError(EVENT_TIMESLOT_INVALID_ID_ERROR);
  }
  return timeslot;
};

/**
 * Determines if user should be waitlisted
 */
const shouldUserBeWaitlisted = (timeslot: Timeslot): boolean => {
  if (timeslot.numParticipants >= timeslot.maxParticipants) {
    if (timeslot.numWaitlisted >= timeslot.maxWaitlist) {
      throw new ConvexError(EVENT_TIMESLOT_FULL_ERROR);
    }
    return true;
  }
  return false;
};

/**
 * Finds user participation in timeslot
 */
const findUserParticipationByTimeslotId = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
  timeslotId: string,
): Promise<EventParticipant | undefined> => {
  const participations = await dtoListEventParticipationsForUser(ctx, eventId, userId);
  const participation = participations.find((p) => p.timeslotId === timeslotId);
  return participation;
};

/**
 * Promotes next waitlisted participant
 */
const promoteWaitlistedParticipant = async (
  ctx: MutationCtx,
  eventId: Id<"events">,
  timeslotId: string,
  timeslot: Timeslot,
): Promise<void> => {
  const participants = await dtoListAllEventParticipants(ctx, eventId);
  const timeslotParticipants = participants.filter((p) => p.timeslotId === timeslotId);

  if (timeslotParticipants.length < timeslot.maxParticipants) {
    const waitlisted = timeslotParticipants.filter((p) => p.isWaitlisted);
    if (waitlisted.length > 0) {
      const nextParticipant = waitlisted.reduce((earliest, current) =>
        current.joinedAt < earliest.joinedAt ? current : earliest,
      );
      await ctx.db.patch(nextParticipant._id, { isWaitlisted: false, joinedAt: Date.now() });
    }
  }
};

/**
 * Calculates next date based on recurrence
 */
const calculateNextEventDate = (
  recurrence: string,
  startDate: Date,
  iteration: number,
): Date | null => {
  switch (recurrence) {
    case EVENT_RECURRENCE.DAILY:
      return addDays(startDate, iteration);
    case EVENT_RECURRENCE.WEEKLY:
      return addWeeks(startDate, iteration);
    case EVENT_RECURRENCE.MONTHLY:
      return addMonths(startDate, iteration);
    default:
      return null;
  }
};

/**
 * Schedules next batch of event creation
 */
const scheduleNextBatch = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  dates: number[],
): Promise<void> => {
  if (dates.length > 0) {
    const nextScheduleDate = Math.max(...dates);
    await ctx.scheduler.runAt(nextScheduleDate, internal.service.events.functions._createEvents, {
      eventSeriesId: seriesId,
      startDate: nextScheduleDate,
    });
  }
};
