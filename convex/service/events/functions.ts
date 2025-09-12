import { internal } from "@/convex/_generated/api";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR,
} from "@/convex/constants/errors";
import { EVENT_STATUS, EVENT_STATUS_TO_ACTIVITY_TYPE } from "@/convex/constants/events";
import { authenticatedMutation, authenticatedQuery, internalMutation } from "@/convex/functions";
import { createActivity as dtoCreateActivity } from "@/convex/service/activities/database";
import {
  getClubMembershipForUser,
  getClubOrThrow,
  listAllClubMembers,
  listUserClubIds,
} from "@/convex/service/clubs/database";
import { getChangeMetadata } from "@/convex/service/utils/metadata";
import { paginatedResult } from "@/convex/service/utils/pagination";
import {
  enforceClubOwnershipOrAdmin,
  validateUserNotBanned,
} from "@/convex/service/utils/validators/clubs";
import {
  validateAddTimeslot,
  validateEventAccess,
  validateEventDateRange,
  validateEventForCreate,
  validateEventForUpdate,
  validateEventSeriesForCreate,
  validateEventSeriesForUpdate,
  validateEventStatusForJoinLeave,
  validateRemoveTimeslot,
  validateUpdateTimeslot,
} from "@/convex/service/utils/validators/events";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
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
  addEventTimeslot as dtoAddEventTimeslot,
  createEvent as dtoCreateEvent,
  createEventSeries as dtoCreateEventSeries,
  getEventOrThrow as dtoGetEventOrThrow,
  getEventSeriesOrThrow as dtoGetEventSeriesOrThrow,
  getOrCreateEventFromSeries as dtoGetOrCreateEventFromSeries,
  listAllEventParticipants as dtoListAllEventParticipants,
  listEventSeriesForClub as dtoListEventSeriesForClub,
  listEventsForClub as dtoListEventsForClub,
  listParticipatingEvents as dtoListParticipatingEvents,
  removeEventTimeslotWithParticipants as dtoRemoveEventTimeslotWithParticipants,
  searchEvents as dtoSearchEvents,
  updateEvent as dtoUpdateEvent,
  updateEventSeries as dtoUpdateEventSeries,
  updateEventTimeslot as dtoUpdateEventTimeslot,
} from "./database";
import { generateUpcomingEventDates } from "./helpers/dates";
import {
  getOrCreatePermanentParticipants,
  syncPermanentParticipants,
} from "./helpers/participants";
import {
  activateEventSeries,
  cancelEventScheduledFunctions,
  getOrScheduleEventStatusTransitions,
  scheduleNextEventGeneration,
} from "./helpers/scheduling";
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
  eventUpdateInputSchema,
  timeslotInputSchema,
  timeslotUpdateInputSchema,
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
    await enforceClubOwnershipOrAdmin(ctx, club);
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
    await enforceClubOwnershipOrAdmin(ctx, club);
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
 * @param filters - Search filters (date range, clubs, skill level, location, status)
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
    await enforceRateLimit(ctx, "createEvent", ctx.currentUser._id);
    const club = await getClubOrThrow(ctx, args.input.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventSeriesForCreate(ctx, args.input, club);

    const eventSeries = await dtoCreateEventSeries(ctx, args.input, ctx.currentUser._id);

    await dtoCreateActivity(ctx, {
      eventSeriesId: eventSeries._id,
      clubId: eventSeries.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_SERIES_CREATED,
      metadata: [{ fieldChanged: "name", newValue: eventSeries.name }],
    });

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
    await enforceRateLimit(ctx, "updateEvent", ctx.currentUser._id + args.eventSeriesId);
    const eventSeries = await dtoGetEventSeriesOrThrow(ctx, args.eventSeriesId);
    const club = await getClubOrThrow(ctx, eventSeries.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventSeriesForUpdate(ctx, club, eventSeries, args.input);

    const updatedEventSeries = await dtoUpdateEventSeries(ctx, args.eventSeriesId, args.input);

    await dtoCreateActivity(ctx, {
      eventSeriesId: args.eventSeriesId,
      clubId: eventSeries.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_SERIES_UPDATED,
      metadata: getChangeMetadata(eventSeries, args.input),
    });

    // On updating isActive
    if (!eventSeries.isActive && updatedEventSeries.isActive === true) {
      await activateEventSeries(ctx, eventSeries);
    }

    if (eventSeries.isActive && updatedEventSeries.isActive === false) {
      await ctx.runMutation(internal.service.events.functions._deactivateEventSeries, {
        eventSeriesId: args.eventSeriesId,
      });
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
    await enforceClubOwnershipOrAdmin(ctx, club);

    await ctx.table("eventSeries").getX(args.eventSeriesId).delete();

    await dtoCreateActivity(ctx, {
      eventSeriesId: args.eventSeriesId,
      clubId: eventSeries.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_SERIES_DELETED,
      metadata: [{ fieldChanged: "name", previousValue: eventSeries.name }],
    });
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
    await enforceRateLimit(ctx, "createEvent", ctx.currentUser._id);
    const club = await getClubOrThrow(ctx, args.input.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await validateEventForCreate(ctx, args.input, club);

    const event = await dtoCreateEvent(ctx, ctx.currentUser._id, args.input);

    await dtoCreateActivity(ctx, {
      eventId: event._id,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_CREATED,
      metadata: [
        { fieldChanged: "name", newValue: event.name },
        { fieldChanged: "date", newValue: event.date.toString() },
      ],
    });

    return event;
  },
});

/**
 * Updates an existing event with comprehensive validation and scheduling management
 * @param eventId - ID of the event to update
 * @param input - Partial event data to update (timeslots, status, timing, etc.)
 * @returns Updated event with processed timeslots and synchronized participants
 * @throws {ConvexError} When event not found, access denied, or validation fails
 *
 * **Key Features:**
 * - Processes timeslots at database level (generates IDs, calculates participant counts)
 * - Synchronizes permanent participants when timeslots change
 * - Cancels scheduled functions when event is cancelled or timing changes
 * - Reschedules status transitions for timing changes (unless cancelled)
 * - Creates comprehensive activity logs for all changes
 * - Validates timing constraints and business rules
 */
export const updateEvent = authenticatedMutation()({
  args: { eventId: zid("events"), input: eventUpdateInputSchema },
  returns: z.object(withSystemFields("events", eventSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateEvent", ctx.currentUser._id + args.eventId);
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
    const club = await getClubOrThrow(ctx, event.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    const eventUpdates = await validateEventForUpdate(ctx, club, event, args.input);

    const updatedEvent = await dtoUpdateEvent(ctx, args.eventId, eventUpdates);

    // Cancel any pending scheduled functions if event is cancelled or event time changes
    if (
      args.input.status === EVENT_STATUS.CANCELLED ||
      args.input.startTime ||
      args.input.endTime ||
      args.input.date
    ) {
      await cancelEventScheduledFunctions(ctx, args.eventId);
    }

    // Reschedule functions for event time changes (but not for cancelled events)
    if (
      (args.input.startTime || args.input.endTime || args.input.date) &&
      args.input.status !== EVENT_STATUS.CANCELLED
    ) {
      await getOrScheduleEventStatusTransitions(ctx, updatedEvent);
    }

    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_UPDATED,
      metadata: getChangeMetadata(event, args.input),
    });

    return updatedEvent;
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
    await enforceClubOwnershipOrAdmin(ctx, club);
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
    await enforceRateLimit(ctx, "joinEvent", ctx.currentUser._id + args.eventId);
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

    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_JOINED,
      metadata: [
        { fieldChanged: "event", newValue: event.name },
        { fieldChanged: "timeslot", newValue: args.timeslotId },
        { fieldChanged: "waitlisted", newValue: isWaitlisted.toString() },
      ],
    });

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
    await enforceRateLimit(ctx, "leaveEvent", ctx.currentUser._id + args.eventId);
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

    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_LEFT,
      metadata: [
        { fieldChanged: "event", previousValue: event.name },
        { fieldChanged: "timeslot", previousValue: args.timeslotId },
      ],
    });

    await promoteWaitlistedParticipant(ctx, args.eventId, args.timeslotId, timeslot);

    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_WAITLIST_PROMOTED,
      metadata: [
        { fieldChanged: "event", previousValue: event.name },
        { fieldChanged: "timeslot", previousValue: args.timeslotId },
        { fieldChanged: "isWaitlisted", previousValue: "true", newValue: "false" },
      ],
    });
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
    scheduleNextBatch: v.optional(v.boolean()),
  },
  returns: {
    events: v.array(zodOutputToConvex(z.object(withSystemFields("events", eventSchema.shape)))),
  },
  handler: async (ctx, { eventSeriesId, range, scheduleNextBatch }) => {
    const { startDate, endDate } = range;
    const series = await dtoGetEventSeriesOrThrow(ctx, eventSeriesId);
    const finalEndDate = Math.min(endDate, series.schedule.endDate);
    const dates = generateUpcomingEventDates(series, startDate, finalEndDate);
    const events = await Promise.all(
      dates.map(async (date) => {
        const event = await dtoGetOrCreateEventFromSeries(ctx, series, date);
        await getOrCreatePermanentParticipants(ctx, event);
        await getOrScheduleEventStatusTransitions(ctx, event);
        return event;
      }),
    );

    if (scheduleNextBatch === true) {
      await scheduleNextEventGeneration(ctx, series._id, dates);
    }

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
    const event = await ctx.table("events").getX(eventId).patch({ status }).get();

    // Create activity for status changes
    await dtoCreateActivity(ctx, {
      eventId,
      clubId: event.clubId,
      type: EVENT_STATUS_TO_ACTIVITY_TYPE[status],
      metadata: [
        { fieldChanged: "event", newValue: event.name },
        { fieldChanged: "status", newValue: status },
      ],
    });

    return event;
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
    const eventSeries = await ctx
      .table("eventSeries")
      .getX(eventSeriesId)
      .patch({ isActive: false })
      .get();

    await dtoCreateActivity(ctx, {
      eventSeriesId,
      clubId: eventSeries.clubId,
      type: ACTIVITY_TYPES.EVENT_SERIES_DEACTIVATED,
      metadata: [
        { fieldChanged: "name", previousValue: eventSeries.name },
        { fieldChanged: "active", previousValue: "true", newValue: "false" },
      ],
    });

    const nextBatchFunction = await eventSeries.edge("onNextBatchFunction");
    if (nextBatchFunction && nextBatchFunction.state.kind === "pending") {
      await ctx.scheduler.cancel(nextBatchFunction._id);
    }

    return eventSeries;
  },
});

// ============================================================================
// TIMESLOT MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Adds a new timeslot to an event
 * @param eventId - ID of the event to add timeslot to
 * @param input - Timeslot data to add
 * @returns Updated event with new timeslot
 * @throws {ConvexError} When validation fails or access denied
 */
export const addEventTimeslot = authenticatedMutation()({
  args: {
    eventId: zid("events"),
    input: timeslotInputSchema,
  },
  returns: z.object(withSystemFields("events", eventSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateEvent", ctx.currentUser._id + args.eventId);
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
    const club = await getClubOrThrow(ctx, event.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    const clubMembers = await listAllClubMembers(ctx, club._id);
    validateAddTimeslot(event, args.input, clubMembers);

    const updatedEvent = await dtoAddEventTimeslot(ctx, args.eventId, args.input);

    await syncPermanentParticipants(ctx, updatedEvent, event);
    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_UPDATED,
      metadata: [{ fieldChanged: "timeslots", newValue: "added" }],
    });

    return updatedEvent;
  },
});

/**
 * Updates an existing timeslot in an event
 * @param eventId - ID of the event containing the timeslot
 * @param input - Partial timeslot data to update
 * @returns Updated event
 * @throws {ConvexError} When validation fails or access denied
 */
export const updateEventTimeslot = authenticatedMutation()({
  args: { eventId: zid("events"), input: timeslotUpdateInputSchema },
  returns: z.object(withSystemFields("events", eventSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateEvent", ctx.currentUser._id + args.eventId);
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
    const club = await getClubOrThrow(ctx, event.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    const clubMembers = await listAllClubMembers(ctx, club._id);
    validateUpdateTimeslot(event, args.input, clubMembers);

    const updatedEvent = await dtoUpdateEventTimeslot(ctx, args.eventId, args.input);

    await syncPermanentParticipants(ctx, updatedEvent, event);
    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_UPDATED,
      metadata: [{ fieldChanged: "timeslot", newValue: args.input.id }],
    });

    return updatedEvent;
  },
});

/**
 * Removes a timeslot from an event and deletes all associated participants
 * @param eventId - ID of the event containing the timeslot
 * @param timeslotId - ID of the timeslot to remove
 * @returns Updated event
 * @throws {ConvexError} When validation fails or access denied
 */
export const removeEventTimeslot = authenticatedMutation()({
  args: { eventId: zid("events"), timeslotId: z.string() },
  returns: z.object(withSystemFields("events", eventSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateEvent", ctx.currentUser._id + args.eventId);
    const event = await dtoGetEventOrThrow(ctx, args.eventId);
    const club = await getClubOrThrow(ctx, event.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    validateRemoveTimeslot(event, args.timeslotId);

    const updatedEvent = await dtoRemoveEventTimeslotWithParticipants(
      ctx,
      args.eventId,
      args.timeslotId,
    );

    await dtoCreateActivity(ctx, {
      eventId: args.eventId,
      clubId: event.clubId,
      userId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.EVENT_UPDATED,
      metadata: [{ fieldChanged: "timeslots", previousValue: args.timeslotId }],
    });

    return updatedEvent;
  },
});
