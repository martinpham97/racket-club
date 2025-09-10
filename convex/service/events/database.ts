import { Id } from "@/convex/_generated/dataModel";
import { EVENT_NOT_FOUND_ERROR, EVENT_SERIES_NOT_FOUND_ERROR } from "@/convex/constants/errors";
import { EVENT_STATUS } from "@/convex/constants/events";
import { MutationCtx, QueryCtx } from "@/convex/types";
import { PaginationOptions, PaginationResult } from "convex/server";
import { ConvexError } from "convex/values";
import { nanoid } from "nanoid";
import { createEventFilter } from "./helpers/filters";
import {
  Event,
  EventCreateInput,
  eventCreateInputSchema,
  EventFilters,
  EventParticipant,
  EventParticipantDetails,
  EventSeries,
  EventSeriesCreateInput,
} from "./schemas";

/**
 * Filter criteria for querying events by date range
 */
export interface ListEventsFilters {
  fromDate: number;
  toDate: number;
}

/**
 * Gets an event series by its ID or throw if does not exist
 * @param ctx Query context
 * @param eventSeriesId Event series ID to retrieve
 * @returns Event series if found
 * @throws {ConvexError} When event series is not found
 */
export const getEventSeriesOrThrow = async (
  ctx: QueryCtx,
  eventSeriesId: Id<"eventSeries">,
): Promise<EventSeries> => {
  const eventSeries = await ctx.table("eventSeries").get(eventSeriesId);
  if (!eventSeries) {
    throw new ConvexError(EVENT_SERIES_NOT_FOUND_ERROR);
  }
  return eventSeries;
};

/**
 * Gets an event by its ID or throw if does not exist
 * @param ctx Query context
 * @param eventId Event ID to retrieve
 * @returns Event if found
 * @throws {ConvexError} When event is not found
 */
export const getEventOrThrow = async (ctx: QueryCtx, eventId: Id<"events">): Promise<Event> => {
  const event = await ctx.table("events").get(eventId);
  if (!event) {
    throw new ConvexError(EVENT_NOT_FOUND_ERROR);
  }
  return event;
};

/**
 * Retrieves all event series for a specific club
 * @param ctx Query context for database operations
 * @param clubId Unique identifier of the club
 * @param pagination Pagination options for result set
 * @returns Paginated list of event series belonging to the club
 */
export const listEventSeriesForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  pagination: PaginationOptions,
): Promise<PaginationResult<EventSeries>> => {
  return await ctx
    .table("eventSeries", "clubId", (q) => q.eq("clubId", clubId))
    .paginate(pagination);
};

/**
 * Retrieves events for a specific club within a date range
 * @param ctx Query context for database operations
 * @param clubId Unique identifier of the club
 * @param filters Date range filters for events
 * @param pagination Pagination options for result set
 * @returns Paginated list of events for the club, ordered by date ascending
 */
export const listEventsForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  filters: ListEventsFilters,
  pagination: PaginationOptions,
): Promise<PaginationResult<Event>> => {
  return await ctx
    .table("events", "clubDate", (q) =>
      q.eq("clubId", clubId).gte("date", filters.fromDate).lte("date", filters.toDate),
    )
    .order("asc")
    .paginate(pagination);
};

/**
 * Retrieves events where a specific user is participating
 * @param ctx Query context for database operations
 * @param userId Unique identifier of the user
 * @param filters Date range filters for events
 * @param pagination Pagination options for result set
 * @returns Paginated list of events with participation details where user is registered
 */
export const listParticipatingEvents = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  filters: ListEventsFilters,
  pagination: PaginationOptions,
): Promise<PaginationResult<EventParticipantDetails>> => {
  const userParticipations = await ctx
    .table("eventParticipants", "userDate", (q) =>
      q.eq("userId", userId).gte("date", filters.fromDate).lte("date", filters.toDate),
    )
    .paginate(pagination);
  const eventsWithParticipation = (
    await Promise.all(
      userParticipations.page.map(async (participation) => {
        const event = await participation.edgeX("event");
        return { ...event, participation };
      }),
    )
  ).filter(Boolean) as EventParticipantDetails[];
  return { ...userParticipations, page: eventsWithParticipation };
};

/**
 * Retrieves all participation records for a specific user in an event
 * @param ctx Query context for database operations
 * @param eventId Unique identifier of the event
 * @param userId Unique identifier of the user
 * @returns Array of event participation records for the user in the specified event
 */
export const listEventParticipationsForUser = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
): Promise<Array<EventParticipant>> => {
  return await ctx.table("eventParticipants", "eventUser", (q) =>
    q.eq("eventId", eventId).eq("userId", userId),
  );
};

/**
 * Retrieves all participants for a specific event
 * @param ctx Query context for database operations
 * @param eventId Unique identifier of the event
 * @returns Array of all event participation records for the specified event
 */
export const listAllEventParticipants = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<Array<EventParticipant>> => {
  return await ctx.table("events").getX(eventId).edge("participants");
};

/**
 * Retrieves an event for a specific series and date
 * @param ctx Query context for database operations
 * @param eventSeriesId Unique identifier of the event series
 * @param date Unix timestamp in milliseconds for the event date
 * @returns Event if found, null otherwise
 */
export const getEventAtDate = async (
  ctx: QueryCtx,
  eventSeriesId: Id<"eventSeries">,
  date: number,
): Promise<Event | null> => {
  return await ctx
    .table("events", "eventSeriesDate", (q) =>
      q.eq("eventSeriesId", eventSeriesId).eq("date", date),
    )
    .first();
};

/**
 * Searches events with optimized filtering and pagination
 * @param ctx Query context for database operations
 * @param filters Event filters (date range, clubs, skill level, location, status)
 * @param userMemberClubIds Club IDs where user has membership access
 * @param pagination Pagination options for result set
 * @returns Paginated list of events matching search criteria
 */
export const searchEvents = async (
  ctx: QueryCtx,
  filters: EventFilters,
  userMemberClubIds: Id<"clubs">[],
  pagination: PaginationOptions,
): Promise<PaginationResult<Event>> => {
  const events = await ctx
    .table("events", "date", (q) => q.gte("date", filters.fromDate).lte("date", filters.toDate))
    .order("asc")
    .paginate(pagination);
  return { ...events, page: events.page.filter(createEventFilter(filters, userMemberClubIds)) };
};

/**
 * Creates a new event series in the database
 * @param ctx Mutation context for database operations
 * @param eventSeries Event series data to create
 * @param createdBy User ID of the event series creator
 * @returns Created event series
 */
export const createEventSeries = async (
  ctx: MutationCtx,
  eventSeries: EventSeriesCreateInput,
  createdBy: Id<"users">,
): Promise<EventSeries> => {
  const now = Date.now();
  return await ctx
    .table("eventSeries")
    .insert({
      ...eventSeries,
      createdBy,
      createdAt: now,
      modifiedAt: now,
    })
    .get();
};

/**
 * Updates an existing event series in the database
 * @param ctx Mutation context for database operations
 * @param eventSeriesId Unique identifier of the event series to update
 * @param updateData Partial event series data to update
 * @returns Updated event series
 */
export const updateEventSeries = async (
  ctx: MutationCtx,
  eventSeriesId: Id<"eventSeries">,
  updateData: Partial<EventSeries>,
): Promise<EventSeries> => {
  return await ctx
    .table("eventSeries")
    .getX(eventSeriesId)
    .patch({
      ...updateData,
      modifiedAt: Date.now(),
    })
    .get();
};

/**
 * Creates a new event from an event series
 * @param ctx Mutation context for database operations
 * @param createdBy Event creator user ID
 * @param event Event data to base the event on
 * @param eventSeriesId Optional event series ID to link this event to it
 * @returns Created event
 */
export const createEvent = async (
  ctx: MutationCtx,
  createdBy: Id<"users">,
  event: EventCreateInput,
  eventSeriesId?: Id<"eventSeries">,
): Promise<Event> => {
  return await ctx
    .table("events")
    .insert({
      ...eventCreateInputSchema.parse(event),
      eventSeriesId,
      timeslots: event.timeslots.map((ts) => ({
        ...ts,
        id: nanoid(),
        numParticipants: ts.permanentParticipants.length,
        numWaitlisted: 0,
      })),
      status: EVENT_STATUS.NOT_STARTED,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      createdBy,
    })
    .get();
};

/**
 * Gets an existing event for a series and date, or creates a new one if it doesn't exist
 * @param ctx Mutation context
 * @param series Event series to create event from
 * @param date Unix timestamp for the event date
 * @returns Existing or newly created event
 */
export const getOrCreateEventFromSeries = async (
  ctx: MutationCtx,
  series: EventSeries,
  date: number,
): Promise<Event> => {
  let event = await getEventAtDate(ctx, series._id, date);
  if (!event) {
    const eventInput = eventCreateInputSchema.parse({ ...series, date });
    event = await createEvent(ctx, series.createdBy, eventInput, series._id);
  }
  return event;
};

/**
 * Updates an existing event in the database
 * @param ctx Mutation context for database operations
 * @param eventId Event ID to update
 * @param updateData Partial event data to update
 * @returns Updated event
 */
export const updateEvent = async (
  ctx: MutationCtx,
  eventId: Id<"events">,
  updateData: Partial<Event>,
): Promise<Event> => {
  return await ctx
    .table("events")
    .getX(eventId)
    .patch({
      ...updateData,
      modifiedAt: Date.now(),
    })
    .get();
};

/**
 * Creates a new event participation record
 * @param ctx Mutation context for database operations
 * @param participation Event participation data
 * @returns Created event participation
 */
export const createEventParticipation = async (
  ctx: MutationCtx,
  participation: Omit<EventParticipant, "_id" | "_creationTime">,
): Promise<EventParticipant> => {
  return await ctx.table("eventParticipants").insert(participation).get();
};

/**
 * Deletes an event participation record
 * @param ctx Mutation context for database operations
 * @param participationId Event participation ID to delete
 */
export const deleteEventParticipation = async (
  ctx: MutationCtx,
  participationId: Id<"eventParticipants">,
): Promise<void> => {
  await ctx.table("eventParticipants").getX(participationId).delete();
};
