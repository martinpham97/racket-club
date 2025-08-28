import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { EVENT_STATUS } from "@/convex/constants/events";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { PaginationOptions, PaginationResult } from "convex/server";
import { nanoid } from "nanoid";
import {
  baseEventSchema,
  Event,
  EventDetails,
  EventParticipant,
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
 * Retrieves all event series for a specific club
 * @param ctx - Query context for database operations
 * @param clubId - Unique identifier of the club
 * @param pagination - Pagination options for result set
 * @returns Paginated list of event series belonging to the club
 */
export const listEventSeriesForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  pagination: PaginationOptions,
): Promise<PaginationResult<EventSeries>> => {
  return await ctx.db
    .query("eventSeries")
    .withIndex("clubId", (q) => q.eq("clubId", clubId))
    .paginate(pagination);
};

/**
 * Retrieves events for a specific club within a date range
 * @param ctx - Query context for database operations
 * @param clubId - Unique identifier of the club
 * @param filters - Date range filters for events
 * @param pagination - Pagination options for result set
 * @returns Paginated list of events for the club, ordered by date ascending
 */
export const listEventsForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  filters: ListEventsFilters,
  pagination: PaginationOptions,
): Promise<PaginationResult<Event>> => {
  const events = await ctx.db
    .query("events")
    .withIndex("clubIdDate", (q) =>
      q.eq("clubId", clubId).gte("date", filters.fromDate).lte("date", filters.toDate),
    )
    .order("asc")
    .paginate(pagination);
  return events;
};

/**
 * Retrieves events where a specific user is participating
 * @param ctx - Query context for database operations
 * @param userId - Unique identifier of the user
 * @param filters - Date range filters for events
 * @param pagination - Pagination options for result set
 * @returns Paginated list of events with participation details where user is registered
 */
export const listParticipatingEvents = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  filters: ListEventsFilters,
  pagination: PaginationOptions,
): Promise<PaginationResult<EventDetails>> => {
  const userParticipations = await ctx.db
    .query("eventParticipants")
    .withIndex("userDate", (q) =>
      q.eq("userId", userId).gte("date", filters.fromDate).lte("date", filters.toDate),
    )
    .paginate(pagination);
  const eventsWithParticipation = (
    await Promise.all(
      userParticipations.page.map(async (participation) => {
        const event = await ctx.db.get(participation.eventId);
        return event ? { ...event, participation } : null;
      }),
    )
  ).filter(Boolean) as EventDetails[];
  return { ...userParticipations, page: eventsWithParticipation };
};

/**
 * Retrieves all participation records for a specific user in an event
 * @param ctx - Query context for database operations
 * @param eventId - Unique identifier of the event
 * @param userId - Unique identifier of the user
 * @returns Array of event participation records for the user in the specified event
 */
export const listEventParticipationsForUser = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
): Promise<Array<EventParticipant>> => {
  return await ctx.db
    .query("eventParticipants")
    .withIndex("eventUser", (q) => q.eq("eventId", eventId).eq("userId", userId))
    .collect();
};

/**
 * Retrieves all participants for a specific event
 * @param ctx - Query context for database operations
 * @param eventId - Unique identifier of the event
 * @returns Array of all event participation records for the specified event
 */
export const listAllEventParticipants = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<Array<EventParticipant>> => {
  return await ctx.db
    .query("eventParticipants")
    .withIndex("eventId", (q) => q.eq("eventId", eventId))
    .collect();
};

/**
 * Retrieves an event for a specific series and date
 * @param ctx - Query context for database operations
 * @param eventSeriesId - Unique identifier of the event series
 * @param date - Unix timestamp in milliseconds for the event date
 * @returns Event if found, null otherwise
 */
export const getEventAtDate = async (
  ctx: QueryCtx,
  eventSeriesId: Id<"eventSeries">,
  date: number,
): Promise<Event | null> => {
  return await ctx.db
    .query("events")
    .withIndex("eventSeriesDate", (q) => q.eq("eventSeriesId", eventSeriesId).eq("date", date))
    .first();
};

/**
 * Creates a new event series in the database
 *
 * @param ctx - Authenticated context with user profile information
 * @param eventSeries - Event series data to create
 * @returns Promise resolving to the ID of the created event series
 *
 * **Automatic Fields Added:**
 * - `createdBy`: Set to current user's ID
 * - `createdAt`: Set to current timestamp
 * - `modifiedAt`: Set to current timestamp
 *
 * **Note:** This function performs the database insertion only.
 * Validation should be done before calling this function.
 */
export const createEventSeries = async (
  ctx: AuthenticatedWithProfileCtx,
  eventSeries: EventSeriesCreateInput,
): Promise<Id<"eventSeries">> => {
  const now = Date.now();
  return await ctx.db.insert("eventSeries", {
    ...eventSeries,
    createdBy: ctx.currentUser._id,
    createdAt: now,
    modifiedAt: now,
  });
};

/**
 * Updates an existing event series in the database
 *
 * @param ctx - Mutation context for database operations
 * @param eventSeriesId - Unique identifier of the event series to update
 * @param updateData - Partial event series data to update
 * @returns Promise resolving to void
 *
 * **Automatic Fields Updated:**
 * - `modifiedAt`: Set to current timestamp
 *
 * **Note:** This function performs the database update only.
 * Validation should be done before calling this function.
 */
export const updateEventSeries = async (
  ctx: MutationCtx,
  eventSeriesId: Id<"eventSeries">,
  updateData: Partial<EventSeries>,
): Promise<void> => {
  await ctx.db.patch(eventSeriesId, {
    ...updateData,
    modifiedAt: Date.now(),
  });
};

/**
 * Creates a new event from an event series
 *
 * @param ctx - Mutation context for database operations
 * @param eventSeries - Event series data to base the event on
 * @param eventSeriesId - Unique identifier of the parent event series
 * @param date - Unix timestamp in milliseconds for the event date
 * @returns Promise resolving to the ID of the created event
 *
 * **Automatic Fields Added:**
 * - `eventSeriesId`: Links event to its parent series
 * - `timeslots`: Each timeslot gets a unique ID and participant counts initialized
 * - `date`: Set to the provided date
 * - `status`: Initialized to NOT_STARTED
 */
export const createEvent = async (
  ctx: MutationCtx,
  eventSeries: EventSeriesCreateInput,
  eventSeriesId: Id<"eventSeries">,
  date: number,
): Promise<Id<"events">> => {
  return await ctx.db.insert("events", {
    ...baseEventSchema.parse(eventSeries),
    eventSeriesId,
    timeslots: eventSeries.timeslots.map((ts) => ({
      ...ts,
      id: nanoid(),
      numParticipants: ts.permanentParticipants.length,
      numWaitlisted: 0,
    })),
    date,
    status: EVENT_STATUS.NOT_STARTED,
  });
};
