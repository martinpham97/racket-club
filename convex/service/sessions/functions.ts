import { internal } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { internalMutation, MutationCtx } from "@/convex/_generated/server";
import { SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR } from "@/convex/constants/errors";
import {
  MAX_GENERATED_SESSIONS_FOR_RECURRENCE,
  SESSION_RECURRENCE,
  SESSION_STATUS,
} from "@/convex/constants/sessions";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
} from "@/convex/service/utils/functions";
import { getStartOfDayInTimezone, getUtcTimestampForDate } from "@/convex/service/utils/time";
import { enforceClubOwnershipOrAdmin } from "@/convex/service/utils/validators/clubs";
import { validateSessionTemplate } from "@/convex/service/utils/validators/sessions";
import { getOrThrow } from "convex-helpers/server/relationships";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { ConvexError, v } from "convex/values";
import { addDays, addMonths, addWeeks } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import z from "zod";
import {
  createSessionInstance as dtoCreateSessionInstance,
  createSessionTemplate as dtoCreateSessionTemplate,
  getSessionInstanceAtDate as dtoGetSessionInstanceAtDate,
} from "./database";
import {
  sessionInstanceStatusSchema,
  SessionTemplate,
  sessionTemplateCreateInputSchema,
  sessionTemplateSchema,
} from "./schemas";

/**
 * Retrieves a session template with permission validation
 *
 * @description Fetches a session template by ID after validating that the current user has
 * permission to view it. Performs club membership checks and enforces row-level security
 * to ensure users can only access templates from clubs they belong to or have appropriate
 * permissions for.
 *
 * @param ctx - Authenticated query context with current user information
 * @param args - Query arguments containing the template identifier
 * @param args.sessionTemplateId - Unique identifier of the session template to retrieve
 *
 * @returns Promise resolving to the complete session template object with all properties
 *
 * @throws {ConvexError} When session template is not found
 * @throws {ConvexError} When associated club is not found
 * @throws {ConvexError} When user lacks permission to view the template (not a club member, banned, etc.)
 * @throws {ConvexError} When user is not authenticated
 */
export const getSessionTemplate = authenticatedQueryWithRLS()({
  args: { sessionTemplateId: zid("sessionTemplates") },
  returns: sessionTemplateSchema,
  handler: async (ctx, args) => {
    const sessionTemplate = await getOrThrow(ctx, args.sessionTemplateId);
    const club = await getOrThrow(ctx, sessionTemplate.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    return sessionTemplate;
  },
});

/**
 * Creates a new session template with automatic instance generation
 *
 * @description Creates a session template after validating user permissions and input data.
 * Automatically generates initial session instances based on the template's recurrence pattern
 * and schedules future instance creation. This is the main entry point for creating recurring
 * or one-time sessions in the system.
 *
 * @param ctx - Authenticated mutation context with current user information
 * @param args - Input arguments containing session template configuration
 * @param args.input - Session template data including schedule, location, and recurrence settings
 *
 * @returns Promise resolving to the unique identifier of the created session template
 *
 * @throws {ConvexError} When user lacks permissions to create sessions in the specified club
 * @throws {ConvexError} When session template validation fails (invalid schedule, timeslots, etc.)
 * @throws {ConvexError} When club is not found or user is not a member
 */
export const createSessionTemplate = authenticatedMutationWithRLS()({
  args: { input: sessionTemplateCreateInputSchema },
  returns: zid("sessionTemplates"),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.input.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    validateSessionTemplate(args.input, club);

    const sessionTemplateId = await dtoCreateSessionTemplate(ctx, args.input);

    // Schedule automatic session deactivation at end date
    const deactivationDate =
      args.input.recurrence === SESSION_RECURRENCE.ONE_TIME
        ? args.input.schedule.date!
        : args.input.schedule.endDate!;
    const endDateInTimezone = getStartOfDayInTimezone(
      deactivationDate,
      args.input.location.timezone,
    );
    await ctx.scheduler.runAt(
      endDateInTimezone.getTime(),
      internal.service.sessions.functions._deactivateSession,
      { sessionTemplateId },
    );

    // Create new session instances
    await ctx.runMutation(internal.service.sessions.functions._createSessionInstances, {
      sessionTemplateId,
    });

    return sessionTemplateId;
  },
});

/**
 * Generates session instances for an active session template
 *
 * @param ctx - Authenticated mutation context with current user information
 * @param args - Arguments containing template ID and date range
 * @param args.sessionTemplateId - Unique identifier of the session template
 * @param args.startDate - Start date for instance generation (Unix timestamp)
 * @param args.endDate - End date for instance generation (Unix timestamp)
 *
 * @returns Promise resolving to array of generated session instance IDs
 * @throws {ConvexError} When template is inactive or user lacks permissions
 */
export const generateSessionInstances = authenticatedMutationWithRLS()({
  args: { sessionTemplateId: zid("sessionTemplates"), startDate: z.number(), endDate: z.number() },
  returns: { sessionInstanceIds: z.array(zid("sessionInstances")) },
  handler: async (ctx, args): Promise<{ sessionInstanceIds: Id<"sessionInstances">[] }> => {
    const { sessionTemplateId } = args;
    const sessionTemplate = await getOrThrow(ctx, sessionTemplateId);
    const club = await getOrThrow(ctx, sessionTemplate.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);

    if (!sessionTemplate.isActive) {
      throw new ConvexError("Unable to generate sessions due to inactive status.");
    }

    return await ctx.runMutation(internal.service.sessions.functions._createSessionInstances, {
      sessionTemplateId,
    });
  },
});

/**
 * Creates session instances for a template and schedules future batch creation
 *
 * @description Internal function that generates session instances based on a template's
 * recurrence pattern, creates automatic status transitions for each instance, and schedules
 * the next batch creation to maintain a rolling window of upcoming sessions. This ensures
 * users always have access to future sessions without overwhelming them with too many at once.
 *
 * @param ctx - Convex mutation context for database operations and scheduling
 * @param args - Arguments containing the session template identifier
 * @param args.sessionTemplateId - Unique identifier of the session template
 *
 * @returns Array containing generated session instance IDs
 * @throws {ConvexError} When session template is not found
 * @throws {Error} When instance creation or scheduling operations fail
 * @internal
 */
export const _createSessionInstances = internalMutation({
  args: { sessionTemplateId: v.id("sessionTemplates") },
  returns: { sessionInstanceIds: v.array(v.id("sessionInstances")) },
  handler: async (ctx, { sessionTemplateId }) => {
    const sessionTemplate = await getOrThrow(ctx, sessionTemplateId);
    const instanceDates = generateUpcomingInstanceDates(sessionTemplate);

    // Create instances and schedule their status transitions
    const sessionInstanceIds = await Promise.all(
      instanceDates.map(async (instanceDate) => {
        const sessionInstanceId = await createSessionInstanceFromTemplate(
          ctx,
          sessionTemplate,
          sessionTemplateId,
          instanceDate,
        );
        if (sessionInstanceId) {
          await scheduleAutomaticStatusTransitions(
            ctx,
            sessionTemplate,
            sessionInstanceId,
            instanceDate,
          );
        }
        return sessionInstanceId;
      }),
    );

    // Schedule next batch creation to maintain rolling window
    if (instanceDates.length > 0) {
      const nextScheduleDate = Math.min(...instanceDates);
      const scheduleId = await ctx.scheduler.runAt(
        nextScheduleDate,
        internal.service.sessions.functions._createSessionInstances,
        { sessionTemplateId },
      );
      await ctx.db.patch(sessionTemplateId, { next_scheduled_id: scheduleId });
    }

    return {
      sessionInstanceIds,
    };
  },
});

/**
 * Updates the status of a session instance
 *
 * @description Internal function used by the scheduler to automatically transition session
 * statuses at predetermined times. Updates a session instance from one status to another,
 * typically used for NOT_STARTED → IN_PROGRESS → COMPLETED transitions.
 *
 * @param ctx - Convex mutation context for database operations
 * @param args - Arguments containing instance ID and new status
 * @param args.sessionInstanceId - Unique identifier of the session instance to update
 * @param args.status - New status to set for the session instance
 *
 * @throws {ConvexError} When session instance is not found
 * @throws {Error} When database update operation fails
 *
 * @example
 * ```typescript
 * // Automatically called by scheduler at session start time
 * await ctx.runMutation(internal.service.sessions.functions._updateSessionInstanceStatus, {
 *   sessionInstanceId: "instance123",
 *   status: "IN_PROGRESS"
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Automatically called by scheduler at session end time
 * await ctx.runMutation(internal.service.sessions.functions._updateSessionInstanceStatus, {
 *   sessionInstanceId: "instance123",
 *   status: "COMPLETED"
 * });
 * ```
 * @internal
 */
export const _updateSessionInstanceStatus = internalMutation({
  args: {
    sessionInstanceId: v.id("sessionInstances"),
    status: zodToConvex(sessionInstanceStatusSchema),
  },
  handler: async (ctx, { sessionInstanceId, status }) => {
    await ctx.db.patch(sessionInstanceId, { status });
  },
});

/**
 * Deactivates a session template to prevent future instance creation
 *
 * @description Internal function that marks a session template as inactive by setting
 * the `isActive` flag to false. This prevents the automatic generation of new session
 * instances while preserving existing instances and template data. Used for soft
 * deletion or temporary suspension of recurring sessions without losing historical data.
 *
 * @param ctx - Convex mutation context for database operations
 * @param args - Arguments containing the session template identifier
 * @param args.sessionTemplateId - Unique identifier of the session template to deactivate
 *
 * @throws {ConvexError} When session template is not found
 * @throws {Error} When database update operation fails
 *
 * @example
 * ```typescript
 * // Deactivate a session template (called internally)
 * await ctx.runMutation(internal.service.sessions.functions._deactivateSession, {
 *   sessionTemplateId: "template123"
 * });
 *
 * // Template becomes inactive, no new instances will be created
 * // Existing instances remain unaffected
 * ```
 */
export const _deactivateSession = internalMutation({
  args: {
    sessionTemplateId: v.id("sessionTemplates"),
  },
  handler: async (ctx, { sessionTemplateId }) => {
    await ctx.db.patch(sessionTemplateId, { isActive: false });
  },
});

/**
 * Creates a single session instance from a template for a specific date
 *
 * @description Generates a new session instance by copying base properties from the session template,
 * creating unique timeslot IDs, and setting the instance date and initial status. Prevents duplicate
 * instances by checking for existing instances on the same date before creation.
 *
 * @param ctx - Convex mutation context for database operations
 * @param sessionTemplate - Source template containing session configuration and timeslots
 * @param sessionTemplateId - Unique identifier of the session template
 * @param instanceDate - Unix timestamp (in milliseconds) for the session instance date
 *
 * @returns Promise resolving to the new session instance ID, or null if instance already exists
 *
 * @throws {Error} When database operations fail or template parsing fails
 */
const createSessionInstanceFromTemplate = async (
  ctx: MutationCtx,
  sessionTemplate: SessionTemplate,
  sessionTemplateId: Id<"sessionTemplates">,
  instanceDate: number,
): Promise<Id<"sessionInstances">> => {
  const existingInstance = await dtoGetSessionInstanceAtDate(ctx, sessionTemplateId, instanceDate);

  if (existingInstance) {
    console.warn(`Session instance for ${new Date(instanceDate).toDateString()} already exists.`);
    return existingInstance._id;
  }

  return await dtoCreateSessionInstance(ctx, sessionTemplate, sessionTemplateId, instanceDate);
};

/**
 * Schedules automatic status transitions for a session instance
 *
 * @description Creates scheduled jobs to automatically update session status from NOT_STARTED
 * to IN_PROGRESS at the session start time, and from IN_PROGRESS to COMPLETED at the end time.
 * Uses the session's timezone to calculate accurate UTC timestamps for scheduling.
 *
 * @param ctx - Convex mutation context for database operations and scheduling
 * @param template - Session template containing schedule and location information
 * @param instanceId - Unique identifier of the session instance to update
 * @param instanceDate - Unix timestamp (in milliseconds) of the session date
 *
 * @throws {Error} When timezone conversion fails or scheduling operations fail
 */
const scheduleAutomaticStatusTransitions = async (
  ctx: MutationCtx,
  template: SessionTemplate,
  instanceId: Id<"sessionInstances">,
  instanceDate: number,
) => {
  const startTime = getUtcTimestampForDate(
    template.schedule.startTime,
    template.location.timezone,
    instanceDate,
  );
  const endTime = getUtcTimestampForDate(
    template.schedule.endTime,
    template.location.timezone,
    instanceDate,
  );

  await Promise.all([
    ctx.scheduler.runAt(
      startTime,
      internal.service.sessions.functions._updateSessionInstanceStatus,
      {
        sessionInstanceId: instanceId,
        status: SESSION_STATUS.IN_PROGRESS,
      },
    ),
    ctx.scheduler.runAt(endTime, internal.service.sessions.functions._updateSessionInstanceStatus, {
      sessionInstanceId: instanceId,
      status: SESSION_STATUS.COMPLETED,
    }),
  ]);
};

/**
 * Generates upcoming session instance dates based on template recurrence pattern
 *
 * @param template - Session template containing recurrence and schedule configuration
 * @returns Array of Unix timestamps (milliseconds) for upcoming session dates
 * @throws {ConvexError} When recurring session lacks required start date
 */
const generateUpcomingInstanceDates = (template: SessionTemplate): number[] => {
  if (template.recurrence === SESSION_RECURRENCE.ONE_TIME && template.schedule.date) {
    return [getStartOfDayInTimezone(template.schedule.date, template.location.timezone).getTime()];
  }

  if (!template.schedule.startDate) {
    throw new ConvexError(SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR);
  }

  const dates: number[] = [];
  const startDateInTz = toZonedTime(template.schedule.startDate, template.location.timezone);

  const maxInstances = MAX_GENERATED_SESSIONS_FOR_RECURRENCE[template.recurrence] || 0;

  for (let i = 0; i < maxInstances; i++) {
    let instanceDateInTz: Date;

    switch (template.recurrence) {
      case SESSION_RECURRENCE.DAILY:
        instanceDateInTz = addDays(startDateInTz, i);
        break;
      case SESSION_RECURRENCE.WEEKLY:
        instanceDateInTz = addWeeks(startDateInTz, i);
        break;
      case SESSION_RECURRENCE.MONTHLY:
        instanceDateInTz = addMonths(startDateInTz, i);
        break;
      default:
        continue;
    }

    const instanceDateUtc = fromZonedTime(instanceDateInTz, template.location.timezone);
    dates.push(instanceDateUtc.getTime());
  }

  return dates;
};
