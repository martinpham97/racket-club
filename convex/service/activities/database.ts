import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/types";
import { PaginationOptions, PaginationResult } from "convex/server";
import { Activity, ActivityCreateInput } from "./schemas";

/**
 * Gets an activity by its ID.
 * @param ctx Query context
 * @param activityId Activity ID to retrieve
 * @returns Activity document if found, null otherwise
 */
export const getActivity = async (
  ctx: QueryCtx,
  activityId: Id<"activities">,
): Promise<Activity | null> => {
  return await ctx.table("activities").get(activityId);
};

/**
 * Lists activities for a user with pagination.
 * @param ctx Query context
 * @param userId User ID to get activities for
 * @param paginationOpts Pagination options
 * @returns Paginated result of user activities
 */
export const listActivitiesForUser = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Activity>> => {
  return await ctx
    .table("activities", "userDate", (q) => q.eq("userId", userId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Lists activities for a club with pagination.
 * @param ctx Query context
 * @param clubId Club ID to get activities for
 * @param paginationOpts Pagination options
 * @returns Paginated result of club activities
 */
export const listActivitiesForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Activity>> => {
  return await ctx
    .table("activities", "clubDate", (q) => q.eq("clubId", clubId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Lists activities for an event with pagination.
 * @param ctx Query context
 * @param eventId Event ID to get activities for
 * @param paginationOpts Pagination options
 * @returns Paginated result of event activities
 */
export const listActivitiesForEvent = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Activity>> => {
  return await ctx
    .table("activities", "eventDate", (q) => q.eq("eventId", eventId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Lists activities for an event series with pagination.
 * @param ctx Query context
 * @param eventSeriesId Event series ID to get activities for
 * @param paginationOpts Pagination options
 * @returns Paginated result of event series activities
 */
export const listActivitiesForEventSeries = async (
  ctx: QueryCtx,
  eventSeriesId: Id<"eventSeries">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Activity>> => {
  return await ctx
    .table("activities", "eventSeriesDate", (q) => q.eq("eventSeriesId", eventSeriesId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Creates a new activity.
 * @param ctx Mutation context
 * @param input Activity creation data
 * @returns Created activity
 */
export const createActivity = async (
  ctx: MutationCtx,
  input: ActivityCreateInput,
): Promise<Activity> => {
  const createdAt = Date.now();
  return await ctx
    .table("activities")
    .insert({
      ...input,
      createdAt,
      date: createdAt,
    })
    .get();
};
