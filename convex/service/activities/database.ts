import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { ActivityType } from "@/convex/constants/activities";
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
  return await ctx.db.get(activityId);
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
  return await ctx.db
    .query("activities")
    .withIndex("resourceDate", (q) => q.eq("resourceId", resourceId))
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
  return await ctx.db
    .query("activities")
    .withIndex("relatedId", (q) => q.eq("relatedId", relatedId))
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
  return await ctx.db
    .query("activities")
    .withIndex("resourceTypeScheduledAt", (q) =>
      q.eq("resourceId", resourceId).eq("type", type).eq("scheduledAt", scheduledAt),
    )
    .first();
};

/**
 * Creates a new activity.
 * @param ctx Mutation context
 * @param input Activity creation data
 * @returns ID of the created activity
 */
export const createActivity = async (
  ctx: MutationCtx,
  input: ActivityCreateInput,
): Promise<Id<"activities">> => {
  const createdAt = Date.now();
  return await ctx.db.insert("activities", {
    ...input,
    createdAt,
    date: input.scheduledAt ?? createdAt,
  });
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
  const activities = await ctx.db
    .query("activities")
    .withIndex("resourceType", (q) => q.eq("resourceId", resourceId))
    .order("desc")
    .collect();
  activities.forEach(async (activity) => await ctx.db.delete(activity._id));
};
