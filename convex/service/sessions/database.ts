import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { SESSION_STATUS } from "@/convex/constants/sessions";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { nanoid } from "nanoid";
import { baseSessionSchema, SessionInstance, SessionTemplateCreateInput } from "./schemas";

/**
 * Retrieves a session instance for a specific template and date
 *
 * @param ctx - Query context
 * @param sessionTemplateId - Unique identifier of the session template
 * @param date - Unix timestamp in milliseconds for the instance date
 * @returns Promise resolving to the session instance if found, null otherwise
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
 * - `timeslots`: Each timeslot gets a unique ID generated with nanoid
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
    timeslots: sessionTemplate.timeslots.map((ts) => ({ ...ts, id: nanoid() })),
    instanceDate,
    status: SESSION_STATUS.NOT_STARTED,
  });
};
