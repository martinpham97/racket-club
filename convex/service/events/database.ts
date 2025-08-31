import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { EVENT_STATUS } from "@/convex/constants/events";
import { filter } from "convex-helpers/server/filter";
import { PaginationOptions, PaginationResult } from "convex/server";
import { nanoid } from "nanoid";
import { createEventFilter } from "./filters";
import {
  Event,
  EventCreateInput,
  eventCreateInputSchema,
  EventDetails,
  EventFilters,
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
    .withIndex("clubDate", (q) =>
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
 * Searches events with optimized filtering and pagination
 * @param ctx - Query context for database operations
 * @param query - Optional text search query for event name/description
 * @param filters - Event filters (date range, clubs, skill level, location)
 * @param userMemberClubIds - Club IDs where user has membership access
 * @param pagination - Pagination options for result set
 * @returns Paginated list of events matching search criteria
 */
export const searchEvents = async (
  ctx: QueryCtx,
  query: string | undefined,
  filters: EventFilters,
  userMemberClubIds: Id<"clubs">[],
  pagination: PaginationOptions,
): Promise<PaginationResult<Event>> => {
  return await filter(
    ctx.db
      .query("events")
      .withIndex("date", (q) => q.gte("date", filters.fromDate).lte("date", filters.toDate))
      .order("asc"),
    createEventFilter(query, filters, userMemberClubIds),
  ).paginate(pagination);
};

/**
 * Creates a new event series in the database
 *
 * @param ctx - Mutation context for database operations
 * @param eventSeries - Event series data to create
 * @param createdBy - User ID of the event series creator
 * @returns Promise resolving to the ID of the created event series
 *
 * **Automatic Fields Added:**
 * - `createdAt`: Set to current timestamp
 * - `modifiedAt`: Set to current timestamp
 *
 * **Note:** This function performs the database insertion only.
 * Validation should be done before calling this function.
 */
export const createEventSeries = async (
  ctx: MutationCtx,
  eventSeries: EventSeriesCreateInput,
  createdBy: Id<"users">,
): Promise<Id<"eventSeries">> => {
  const now = Date.now();
  return await ctx.db.insert("eventSeries", {
    ...eventSeries,
    createdBy,
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
 * @param createdBy - Event creator user ID
 * @param event - Event data to base the event on
 * @param eventSeriesId - Optional event series ID to link this event to it
 * @returns Promise resolving to the ID of the created event
 *
 * **Automatic Fields Added:**
 * - `eventSeriesId`: Links event to its parent series
 * - `timeslots`: Each timeslot gets a unique ID and participant counts initialized
 * - `status`: Initialized to NOT_STARTED
 * - `createdAt`: Set to current date/time
 * - `modifiedAt`: Set to current date/time
 */
export const createEvent = async (
  ctx: MutationCtx,
  createdBy: Id<"users">,
  event: EventCreateInput,
  eventSeriesId?: Id<"eventSeries">,
): Promise<Id<"events">> => {
  return await ctx.db.insert("events", {
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
  });
};
