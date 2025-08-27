import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { SESSION_STATUS } from "@/convex/constants/sessions";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { PaginationOptions, PaginationResult } from "convex/server";
import { nanoid } from "nanoid";
import {
  baseSessionSchema,
  SessionInstance,
  SessionInstanceDetails,
  SessionParticipant,
  SessionTemplate,
  SessionTemplateCreateInput,
} from "./schemas";

/**
 * Filter criteria for querying session instances by date range
 */
export interface ListSessionInstancesFilters {
  fromDate: number;
  toDate: number;
}

/**
 * Retrieves all session templates for a specific club
 * @param ctx - Query context for database operations
 * @param clubId - Unique identifier of the club
 * @param pagination - Pagination options for result set
 * @returns Paginated list of session templates belonging to the club
 */
export const listSessionTemplatesForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  pagination: PaginationOptions,
): Promise<PaginationResult<SessionTemplate>> => {
  return await ctx.db
    .query("sessionTemplates")
    .withIndex("clubId", (q) => q.eq("clubId", clubId))
    .paginate(pagination);
};

/**
 * Retrieves session instances for a specific club within a date range
 * @param ctx - Query context for database operations
 * @param clubId - Unique identifier of the club
 * @param filters - Date range filters for session instances
 * @param pagination - Pagination options for result set
 * @returns Paginated list of session instances for the club, ordered by date ascending
 */
export const listSessionInstancesForClub = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  filters: ListSessionInstancesFilters,
  pagination: PaginationOptions,
): Promise<PaginationResult<SessionInstance>> => {
  const sessions = await ctx.db
    .query("sessionInstances")
    .withIndex("clubIdInstanceDate", (q) =>
      q
        .eq("clubId", clubId)
        .gte("instanceDate", filters.fromDate)
        .lte("instanceDate", filters.toDate),
    )
    .order("asc")
    .paginate(pagination);
  return sessions;
};

/**
 * Retrieves session instances where a specific user is participating
 * @param ctx - Query context for database operations
 * @param userId - Unique identifier of the user
 * @param filters - Date range filters for session instances
 * @param pagination - Pagination options for result set
 * @returns Paginated list of session instances with participation details where user is registered
 */
export const listParticipatingSessionInstances = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  filters: ListSessionInstancesFilters,
  pagination: PaginationOptions,
): Promise<PaginationResult<SessionInstanceDetails>> => {
  const userParticipations = await ctx.db
    .query("sessionParticipants")
    .withIndex("userIdInstanceDate", (q) =>
      q
        .eq("userId", userId)
        .gte("instanceDate", filters.fromDate)
        .lte("instanceDate", filters.toDate),
    )
    .paginate(pagination);
  const sessionIds = userParticipations.page.map((p) => p.sessionInstanceId);
  const sessions = await Promise.all(sessionIds.map((id) => ctx.db.get(id)));
  const sessionsWithParticipation = userParticipations.page
    .map((participation, index) => {
      const session = sessions[index];
      return session ? { ...session, participation } : null;
    })
    .filter(Boolean) as SessionInstanceDetails[];
  return { ...userParticipations, page: sessionsWithParticipation };
};

/**
 * Retrieves all participation records for a specific user in a session instance
 * @param ctx - Query context for database operations
 * @param sessionInstanceId - Unique identifier of the session instance
 * @param userId - Unique identifier of the user
 * @returns Array of session participation records for the user in the specified session
 */
export const listSessionParticipationsForUser = async (
  ctx: QueryCtx,
  sessionInstanceId: Id<"sessionInstances">,
  userId: Id<"users">,
): Promise<Array<SessionParticipant>> => {
  return await ctx.db
    .query("sessionParticipants")
    .withIndex("instanceUser", (q) =>
      q.eq("sessionInstanceId", sessionInstanceId).eq("userId", userId),
    )
    .collect();
};

/**
 * Retrieves all participants for a specific session instance
 * @param ctx - Query context for database operations
 * @param sessionInstanceId - Unique identifier of the session instance
 * @returns Array of all session participation records for the specified session
 */
export const listAllSessionParticipants = async (
  ctx: QueryCtx,
  sessionInstanceId: Id<"sessionInstances">,
): Promise<Array<SessionParticipant>> => {
  return await ctx.db
    .query("sessionParticipants")
    .withIndex("sessionInstanceId", (q) => q.eq("sessionInstanceId", sessionInstanceId))
    .collect();
};

/**
 * Retrieves a session instance for a specific template and date
 * @param ctx - Query context for database operations
 * @param sessionTemplateId - Unique identifier of the session template
 * @param date - Unix timestamp in milliseconds for the instance date
 * @returns Session instance if found, null otherwise
 */
export const getSessionInstanceAtDate = async (
  ctx: QueryCtx,
  sessionTemplateId: Id<"sessionTemplates">,
  date: number,
): Promise<SessionInstance | null> => {
  return await ctx.db
    .query("sessionInstances")
    .withIndex("sessionTemplateIdInstanceDate", (q) =>
      q.eq("sessionTemplateId", sessionTemplateId).eq("instanceDate", date),
    )
    .first();
};

/**
 * Creates a new session template in the database
 *
 * @param ctx - Authenticated context with user profile information
 * @param sessionTemplate - Session template data to create
 * @returns Promise resolving to the ID of the created session template
 *
 * **Automatic Fields Added:**
 * - `createdBy`: Set to current user's ID
 * - `createdAt`: Set to current timestamp
 * - `modifiedAt`: Set to current timestamp
 *
 * **Note:** This function performs the database insertion only.
 * Validation should be done before calling this function.
 */
export const createSessionTemplate = async (
  ctx: AuthenticatedWithProfileCtx,
  sessionTemplate: SessionTemplateCreateInput,
): Promise<Id<"sessionTemplates">> => {
  const now = Date.now();
  return await ctx.db.insert("sessionTemplates", {
    ...sessionTemplate,
    createdBy: ctx.currentUser._id,
    createdAt: now,
    modifiedAt: now,
  });
};

/**
 * Creates a new session instance from a session template
 *
 * @param ctx - Mutation context for database operations
 * @param sessionTemplate - Session template data to base the instance on
 * @param sessionTemplateId - Unique identifier of the parent session template
 * @param instanceDate - Unix timestamp in milliseconds for the instance date
 * @returns Promise resolving to the ID of the created session instance
 *
 * **Automatic Fields Added:**
 * - `sessionTemplateId`: Links instance to its parent template
 * - `timeslots`: Each timeslot gets a unique ID and participant counts initialized
 * - `instanceDate`: Set to the provided date
 * - `status`: Initialized to NOT_STARTED
 */
export const createSessionInstance = async (
  ctx: MutationCtx,
  sessionTemplate: SessionTemplateCreateInput,
  sessionTemplateId: Id<"sessionTemplates">,
  instanceDate: number,
): Promise<Id<"sessionInstances">> => {
  return await ctx.db.insert("sessionInstances", {
    ...baseSessionSchema.parse(sessionTemplate),
    sessionTemplateId,
    timeslots: sessionTemplate.timeslots.map((ts) => ({
      ...ts,
      id: nanoid(),
      numParticipants: ts.permanentParticipants.length,
      numWaitlisted: 0,
    })),
    instanceDate,
    status: SESSION_STATUS.NOT_STARTED,
  });
};
