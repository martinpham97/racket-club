"use server";

import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { PaginationOptions, PaginationResult, WithoutSystemFields } from "convex/server";
import { Activity, ResourceId } from "./schemas";

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
    .withIndex("resourceCreatedAt", (q) => q.eq("resourceId", resourceId))
    .order("desc")
    .paginate(paginationOpts);
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
  return await ctx.db
    .query("activities")
    .withIndex("relatedId", (q) => q.eq("relatedId", userId))
    .order("desc")
    .paginate(paginationOpts);
};

/**
 * Creates a new activity.
 * @param ctx Authenticated context with profile
 * @param activity Activity creation data
 * @returns ID of the created activity
 */
export const createActivity = async (
  ctx: AuthenticatedWithProfileCtx,
  activity: WithoutSystemFields<Activity>,
): Promise<Id<"activities">> => {
  return await ctx.db.insert("activities", activity);
};

/**
 * Deletes all activities relating to the given resource.
 * @param ctx Authenticated context with profile
 * @param resourceId Related resource ID
 */
export const deleteActivitiesForResource = async (
  ctx: AuthenticatedWithProfileCtx,
  resourceId: ResourceId,
): Promise<void> => {
  const activities = await ctx.db
    .query("activities")
    .withIndex("resourceType", (q) => q.eq("resourceId", resourceId))
    .order("desc")
    .collect();
  activities.forEach(async (activity) => await ctx.db.delete(activity._id));
};
