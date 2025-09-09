import { internal } from "@/convex/_generated/api";
import {
  AUTH_ACCESS_DENIED_ERROR,
  EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR,
} from "@/convex/constants/errors";
import { authenticatedMutation, authenticatedQuery, internalMutation } from "@/convex/functions";
import {
  getClubMembershipForUser,
  getClubOrThrow,
  listUserClubIds,
} from "@/convex/service/clubs/database";
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
  getEventOrThrow as dtoGetEventOrThrow,
  getEventSeriesOrThrow as dtoGetEventSeriesOrThrow,
  getOrCreateEventFromSeries,
  listAllEventParticipants as dtoListAllEventParticipants,
  listEventSeriesForClub as dtoListEventSeriesForClub,
  listEventsForClub as dtoListEventsForClub,
  listParticipatingEvents as dtoListParticipatingEvents,
  searchEvents as dtoSearchEvents,
  updateEventSeries as dtoUpdateEventSeries,
} from "./database";
import { generateUpcomingEventDates } from "./helpers/dates";
import { getOrCreatePermanentParticipants } from "./helpers/participants";
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
  EventParticipant,
  eventParticipantSchema,
  eventSchema,
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
export const getEventSeries = authenticatedQuery()({
  args: { eventSeriesId: zid("eventSeries") },
  returns: z.object(withSystemFields("eventSeries", eventSeriesSchema.shape)),
  handler: async (ctx, args) => {
    const eventSeries = await dtoGetEventSeriesOrThrow(ctx, args.eventSeriesId);
    const club = await getClubOrThrow(ctx, eventSeries.clubId);
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
export const listClubEventSeries = authenticatedQuery()({
  args: { clubId: zid("clubs"), pagination: convexToZod(paginationOptsValidator) },
  returns: paginatedResult(z.object(withSystemFields("eventSeries", eventSeriesSchema.shape))),
  handler: async (ctx, args) => {
    const club = await getClubOrThrow(ctx, args.clubId);
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
export const getEvent = authenticatedQuery()({
  args: { eventId: zid("events") },
  returns: eventDetailsSchema,
  handler: async (ctx, args) => {
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
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
export const listClubEvents = authenticatedQuery()({
  args: {
    clubId: zid("clubs"),
    filters: eventDateRangeFilterSchema,
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, args) => {
    const { clubId, filters, pagination } = args;
    await getClubOrThrow(ctx, clubId);
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
export const listMyEvents = authenticatedQuery()({
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
export const searchEvents = authenticatedQuery()({
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
 * @returns Created event series
 * @throws {ConvexError} When validation fails or access denied
 */
export const createEventSeries = authenticatedMutation()({
  args: { input: eventSeriesCreateInputSchema },
  returns: z.object(withSystemFields("eventSeries", eventSeriesSchema.shape)),
  handler: async (ctx, args) => {
    const club = await getClubOrThrow(ctx, args.input.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventSeriesForCreate(ctx, args.input, club);

    const eventSeries = await dtoCreateEventSeries(ctx, args.input, ctx.currentUser._id);

    if (args.input.isActive) {
      await activateEventSeries(ctx, eventSeries);
    }

    return eventSeries;
  },
});

/**
 * Updates an existing event series
 * @param eventSeriesId - ID of the event series to update
 * @param input - Partial event series data to update
 * @returns Updated event series
 * @throws {ConvexError} When series not found or access denied
 */
export const updateEventSeries = authenticatedMutation()({
  args: { eventSeriesId: zid("eventSeries"), input: eventSeriesUpdateInputSchema },
  returns: z.object(withSystemFields("eventSeries", eventSeriesSchema.shape)),
  handler: async (ctx, args) => {
    const eventSeries = await dtoGetEventSeriesOrThrow(ctx, args.eventSeriesId);
    const club = await getClubOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventSeriesForUpdate(ctx, club, eventSeries, args.input);

    const updatedEventSeries = await dtoUpdateEventSeries(ctx, args.eventSeriesId, args.input);

    if (!eventSeries.isActive && updatedEventSeries.isActive) {
      await activateEventSeries(ctx, eventSeries);
    }

    return updatedEventSeries;
  },
});

/**
 * Deletes an existing event series
 * @param eventSeriesId - ID of the event series to delete
 * @throws {ConvexError} When series not found or access denied
 */
export const deleteEventSeries = authenticatedMutation()({
  args: { eventSeriesId: zid("eventSeries") },
  handler: async (ctx, args) => {
    const eventSeries = await dtoGetEventSeriesOrThrow(ctx, args.eventSeriesId);
    const club = await getClubOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);

    await ctx.table("eventSeries").getX(args.eventSeriesId).delete();
  },
});

/**
 * Creates a new event
 * @param input - Event configuration data
 * @returns Created event
 * @throws {ConvexError} When validation fails or access denied
 */
export const createEvent = authenticatedMutation()({
  args: { input: eventCreateInputSchema },
  returns: z.object(withSystemFields("events", eventSchema.shape)),
  handler: async (ctx, args) => {
    const club = await getClubOrThrow(ctx, args.input.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventForCreate(ctx, args.input, club);

    const event = await dtoCreateEvent(ctx, ctx.currentUser._id, args.input);
    return event;
  },
});

/**
 * Generates events for an active event series
 * @param eventSeriesId - ID of the event series
 * @param startDate - Start date for generation
 * @param endDate - End date for generation
 * @returns Array of generated events
 * @throws {ConvexError} When series inactive or access denied
 */
export const generateEvents = authenticatedMutation()({
  args: { eventSeriesId: zid("eventSeries"), startDate: z.number(), endDate: z.number() },
  returns: { events: z.array(z.object(withSystemFields("events", eventSchema.shape))) },
  handler: async (ctx, args): Promise<{ events: Event[] }> => {
    const { eventSeriesId, startDate, endDate } = args;
    const eventSeries = await dtoGetEventSeriesOrThrow(ctx, eventSeriesId);
    const club = await getClubOrThrow(ctx, eventSeries.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    validateEventDateRange(startDate, endDate);

    if (!eventSeries.isActive) {
      throw new ConvexError(EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR);
    }

    const generatedEvents = await ctx.runMutation(
      internal.service.events.functions._generateEventsForSeries,
      {
        eventSeriesId,
        range: { startDate, endDate },
      },
    );

    return generatedEvents;
  },
});

/**
 * Joins a user to a event timeslot
 * @param eventId - ID of the event
 * @param timeslotId - ID of the timeslot to join
 * @returns The participation record
 * @throws {ConvexError} When event full, user banned, or invalid request
 */
export const joinEvent = authenticatedMutation()({
  args: { eventId: zid("events"), timeslotId: z.string() },
  returns: z.object(withSystemFields("eventParticipants", eventParticipantSchema.shape)),
  handler: async (ctx, args): Promise<EventParticipant> => {
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
    const club = await getClubOrThrow(ctx, event.clubId);
    const userId = ctx.currentUser._id;

    const existingParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.eventId,
      userId,
      args.timeslotId,
    );

    if (existingParticipation) {
      return existingParticipation;
    }

    await validateUserNotBanned(ctx, club._id, userId);
    await validateEventAccess(ctx, event, userId);
    validateEventStatusForJoinLeave(event);

    const timeslot = getTimeslotOrThrow(event, args.timeslotId);
    const isWaitlisted = shouldUserBeWaitlisted(timeslot);

    const eventParticipation = await ctx
      .table("eventParticipants")
      .insert({
        userId: ctx.currentUser._id,
        joinedAt: Date.now(),
        eventId: args.eventId,
        timeslotId: args.timeslotId,
        isWaitlisted,
        date: event.date,
      })
      .get();
    return eventParticipation;
  },
});

/**
 * Removes a user from a event timeslot
 * @param eventId - ID of the event
 * @param timeslotId - ID of the timeslot to leave
 * @throws {ConvexError} When user not participating or event already started
 */
export const leaveEvent = authenticatedMutation()({
  args: { eventId: zid("events"), timeslotId: z.string() },
  handler: async (ctx, args): Promise<void> => {
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
    const timeslot = getTimeslotOrThrow(event, args.timeslotId);

    const userParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.eventId,
      ctx.currentUser._id,
      args.timeslotId,
    );

    if (!userParticipation) {
      return;
    }

    // Validate event status
    validateEventStatusForJoinLeave(event);

    await ctx.table("eventParticipants").getX(userParticipation._id).delete();
    await promoteWaitlistedParticipant(ctx, args.eventId, args.timeslotId, timeslot);
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
    const series = await dtoGetEventSeriesOrThrow(ctx, eventSeriesId);
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
  returns: zodOutputToConvex(z.object(withSystemFields("events", eventSchema.shape))),
  handler: async (ctx, { eventId, status }) => {
    return await ctx.table("events").getX(eventId).patch({ status }).get();
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
  returns: zodOutputToConvex(z.object(withSystemFields("eventSeries", eventSeriesSchema.shape))),
  handler: async (ctx, { eventSeriesId }) => {
    return await ctx.table("eventSeries").getX(eventSeriesId).patch({ isActive: false }).get();
  },
});
