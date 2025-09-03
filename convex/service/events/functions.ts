import { internal } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { internalMutation, MutationCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR,
} from "@/convex/constants/errors";
import { getClubMembershipForUser, listUserClubIds } from "@/convex/service/clubs/database";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
} from "@/convex/service/utils/functions";
import { paginatedResult } from "@/convex/service/utils/pagination";
import {
  enforceClubOwnershipOrAdmin,
  validateUserNotBanned,
} from "@/convex/service/utils/validators/clubs";
import {
  validateEventAccess,
  validateEventDateRange,
  validateEventForCreate,
  validateEventSeriesForCreate,
  validateEventSeriesForUpdate,
  validateEventStatusForJoinLeave,
} from "@/convex/service/utils/validators/events";
import { getOrThrow } from "convex-helpers/server/relationships";
import {
  convexToZod,
  withSystemFields,
  zid,
  zodOutputToConvex,
  zodToConvex,
} from "convex-helpers/server/zod";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import z from "zod";
import {
  createEvent as dtoCreateEvent,
  createEventSeries as dtoCreateEventSeries,
  getEventAtDate as dtoGetEventAtDate,
  listAllEventParticipants as dtoListAllEventParticipants,
  listEventSeriesForClub as dtoListEventSeriesForClub,
  listEventsForClub as dtoListEventsForClub,
  listParticipatingEvents as dtoListParticipatingEvents,
  searchEvents as dtoSearchEvents,
  updateEventSeries as dtoUpdateEventSeries,
} from "./database";
import { generateUpcomingEventDates } from "./helpers/dates";
import { activateEventSeries, getOrScheduleEventStatusTransitions } from "./helpers/scheduling";
import {
  findUserParticipationByTimeslotId,
  getTimeslotOrThrow,
  promoteWaitlistedParticipant,
  shouldUserBeWaitlisted,
} from "./helpers/timeslots";
import {
  Event,
  eventCreateInputSchema,
  eventDateRangeFilterSchema,
  EventDetails,
  eventDetailsSchema,
  eventFiltersSchema,
  eventSchema,
  EventSeries,
  eventSeriesCreateInputSchema,
  eventSeriesSchema,
  eventSeriesUpdateInputSchema,
  eventStatusSchema,
} from "./schemas";

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Retrieves an event series with permission validation
 * Only club owner or admins can view event series configuration
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
 * Lists event series for a specific club
 * @param clubId - ID of the club to list seriess for
 * @param pagination - Pagination options
 * @returns Paginated list of event seriess
 * @throws {ConvexError} When club not found or access denied
 */
export const listClubEventSeries = authenticatedQueryWithRLS()({
  args: { clubId: zid("clubs"), pagination: convexToZod(paginationOptsValidator) },
  returns: paginatedResult(z.object(withSystemFields("eventSeries", eventSeriesSchema.shape))),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    return await dtoListEventSeriesForClub(ctx, args.clubId, args.pagination);
  },
});

/**
 * Retrieves an event with its participants
 * User can access the event if it is public or user belongs to the event's club
 * or user is already a participant of the event
 * @param eventId - ID of the event to retrieve
 * @returns Event and list of participants
 * @throws {ConvexError} When not found or access denied
 */
export const getEvent = authenticatedQueryWithRLS()({
  args: { eventId: zid("events") },
  returns: eventDetailsSchema,
  handler: async (ctx, args) => {
    const event = await getOrThrow(ctx, args.eventId);
    const participants = await dtoListAllEventParticipants(ctx, args.eventId);
    if (!participants.find((p) => p.userId === ctx.currentUser._id)) {
      await validateEventAccess(ctx, event, ctx.currentUser._id);
    }
    const eventDetails: EventDetails = { ...event, participants };
    return eventDetails;
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
    filters: eventDateRangeFilterSchema,
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { clubId, filters, pagination } = args;
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
    filters: eventDateRangeFilterSchema,
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { filters, pagination } = args;
    return await dtoListParticipatingEvents(ctx, ctx.currentUser._id, filters, pagination);
  },
});

/**
 * Searches for events based on query and filters
 * @param filters - Search filters (date range, clubs, skill level, location)
 * @param pagination - Pagination options
 * @returns Paginated list of matching events
 */
export const searchEvents = authenticatedQueryWithRLS()({
  args: {
    filters: eventFiltersSchema,
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { filters, pagination } = args;
    const userMemberClubIds = await listUserClubIds(ctx, ctx.currentUser._id);
    // TODO: search events based on status
    return await dtoSearchEvents(ctx, filters, userMemberClubIds, pagination);
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
    const eventSeries = await getOrThrow(ctx, eventSeriesId);

    if (args.input.isActive) {
      await activateEventSeries(ctx, eventSeries);
    }

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

    if (!eventSeries.isActive && args.input.isActive) {
      await activateEventSeries(ctx, eventSeries);
    }

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
  returns: { events: z.array(z.object(withSystemFields("events", eventSchema.shape))) },
  handler: async (ctx, args): Promise<{ events: Event[] }> => {
    const { eventSeriesId, startDate, endDate } = args;
    const eventSeries = await getOrThrow(ctx, eventSeriesId);
    const club = await getOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);

    validateEventDateRange(startDate, endDate);

    if (!eventSeries.isActive) {
      throw new ConvexError(EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR);
    }

    return await ctx.runMutation(internal.service.events.functions._generateEventsForSeries, {
      eventSeriesId,
      range: { startDate, endDate },
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
    const userId = ctx.currentUser._id;

    const existingParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.eventId,
      userId,
      args.timeslotId,
    );

    if (existingParticipation) {
      return existingParticipation._id;
    }

    await validateUserNotBanned(ctx, club, userId);
    await validateEventAccess(ctx, event, userId);
    validateEventStatusForJoinLeave(event);

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
export const _generateEventsForSeries = internalMutation({
  args: {
    eventSeriesId: v.id("eventSeries"),
    range: v.object({
      startDate: v.number(),
      endDate: v.number(),
    }),
  },
  returns: {
    events: v.array(zodOutputToConvex(z.object(withSystemFields("events", eventSchema.shape)))),
  },
  handler: async (ctx, { eventSeriesId, range }) => {
    const { startDate, endDate } = range;
    const series = await getOrThrow(ctx, eventSeriesId);
    const finalEndDate = Math.min(endDate, series.schedule.endDate);
    const dates = generateUpcomingEventDates(series, startDate, finalEndDate);
    const events = await Promise.all(
      dates.map(async (date) => {
        const event = await getOrCreateEventFromSeries(ctx, series, date);
        await getOrCreatePermanentParticipants(ctx, event);
        await getOrScheduleEventStatusTransitions(ctx, series, event._id, date);
        return event;
      }),
    );
    return { events };
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
// HELPERS
// ============================================================================

export const getOrCreateEventFromSeries = async (
  ctx: MutationCtx,
  series: EventSeries,
  date: number,
): Promise<Event> => {
  let event = await dtoGetEventAtDate(ctx, series._id, date);
  if (!event) {
    const eventInput = { ...eventCreateInputSchema.parse(series), date };
    const eventId = await dtoCreateEvent(ctx, series.createdBy, eventInput, series._id);
    event = await getOrThrow(ctx, eventId);
  }
  return event;
};

export const getOrCreatePermanentParticipants = async (
  ctx: MutationCtx,
  event: Event,
): Promise<Array<Id<"eventParticipants">>> => {
  const existingParticipants = await dtoListAllEventParticipants(ctx, event._id);
  const participants = event.timeslots.flatMap((timeslot) =>
    timeslot.permanentParticipants.map(async (userId) => {
      const existingParticipation = existingParticipants.find((p) => p.userId === userId);
      if (existingParticipation) {
        return existingParticipation._id;
      }
      return await ctx.db.insert("eventParticipants", {
        userId,
        joinedAt: event.date,
        eventId: event._id,
        timeslotId: timeslot.id,
        isWaitlisted: false,
        date: event.date,
      });
    }),
  );
  return Promise.all(participants);
};
