import { Id } from "@/convex/_generated/dataModel";
import { ActivityType } from "@/convex/constants/activities";
import { MutationCtx, QueryCtx } from "@/convex/types";
import { PaginationOptions, PaginationResult } from "convex/server";
import { Activity, ActivityCreateInput, ResourceId } from "./schemas";

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
 * Lists activities for a resource with pagination.
 * @param ctx Query context
 * @param resourceId Resource ID to get activities for
 * @param paginationOpts Pagination options
 * @returns Paginated result of resource activities
 */
export const listActivitiesForResource = async (
  ctx: QueryCtx,
  resourceId: ResourceId,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Activity>> => {
  return await ctx
    .table("activities")
    .filter((q) => q.eq(q.field("resourceId"), resourceId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Lists activities for a related resource with pagination.
 * @param ctx Query context
 * @param relatedId Related resource ID to get activities for
 * @param paginationOpts Pagination options
 * @returns Paginated result of user activities
 */
export const listActivitiesForRelatedResource = async (
  ctx: QueryCtx,
  relatedId: ResourceId,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Activity>> => {
  return await ctx
    .table("activities")
    .filter((q) => q.eq(q.field("relatedId"), relatedId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Gets a scheduled activity for a resource at a specific time and type.
 * @param ctx Query context
 * @param resourceId Resource ID to get scheduled activity for
 * @param scheduledAt Timestamp when activity is scheduled
 * @param type Activity type to find
 * @returns Single scheduled activity matching the criteria, or null if not found
 */
export const getScheduledActivityForResource = async (
  ctx: QueryCtx,
  resourceId: ResourceId,
  scheduledAt: number,
  type: ActivityType,
): Promise<Activity | null> => {
  return await ctx
    .table("activities")
    .filter((q) =>
      q.and(
        q.eq(q.field("resourceId"), resourceId),
        q.eq(q.field("type"), type),
        q.eq(q.field("scheduledAt"), scheduledAt),
      ),
    )
    .first();
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
      date: input.scheduledAt ?? createdAt,
    })
    .get();
};

/**
 * Deletes all activities relating to the given resource.
 * @param ctx Mutation context
 * @param resourceId Related resource ID
 */
export const deleteActivitiesForResource = async (
  ctx: MutationCtx,
  resourceId: ResourceId,
): Promise<void> => {
  const activities = await ctx
    .table("activities")
    .filter((q) => q.eq(q.field("resourceId"), resourceId));

  for (const activity of activities) {
    await ctx.table("activities").getX(activity._id).delete();
  }
};
