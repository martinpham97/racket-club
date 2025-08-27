import { internal } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { internalMutation, MutationCtx, QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_USER_BANNED_ERROR,
  SESSION_CANNOT_GENERATE_INSTANCE_DUE_TO_INACTIVE_STATUS_ERROR,
  SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
  SESSION_TIMESLOT_FULL_ERROR,
  SESSION_TIMESLOT_INVALID_ID_ERROR,
} from "@/convex/constants/errors";
import {
  MAX_GENERATED_SESSIONS_FOR_RECURRENCE,
  SESSION_RECURRENCE,
  SESSION_STATUS,
  SESSION_VISIBILITY,
} from "@/convex/constants/sessions";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
  AuthenticatedWithProfileCtx,
} from "@/convex/service/utils/functions";
import { paginatedResult } from "@/convex/service/utils/pagination";
import { getStartOfDayInTimezone, getUtcTimestampForDate } from "@/convex/service/utils/time";
import { enforceClubOwnershipOrAdmin } from "@/convex/service/utils/validators/clubs";
import {
  validateSessionStatusForJoinLeave,
  validateSessionTemplate,
} from "@/convex/service/utils/validators/sessions";
import { getOrThrow } from "convex-helpers/server/relationships";
import { convexToZod, withSystemFields, zid, zodToConvex } from "convex-helpers/server/zod";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { addDays, addMonths, addWeeks } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import z from "zod";
import { getClubBanRecordForUser, getClubMembershipForUser } from "../clubs/database";
import { Club } from "../clubs/schemas";
import {
  createSessionInstance as dtoCreateSessionInstance,
  createSessionTemplate as dtoCreateSessionTemplate,
  getSessionInstanceAtDate as dtoGetSessionInstanceAtDate,
  listAllSessionParticipants as dtoListAllSessionParticipants,
  listParticipatingSessionInstances as dtoListParticipatingSessionInstances,
  listSessionInstancesForClub as dtoListSessionInstancesForClub,
  listSessionParticipationsForUser as dtoListSessionParticipationsForUser,
  listSessionTemplatesForClub as dtoListSessionTemplatesForClub,
} from "./database";
import {
  SessionInstance,
  SessionInstanceFilters,
  sessionInstanceFiltersSchema,
  sessionInstanceSchema,
  sessionInstanceStatusSchema,
  SessionParticipant,
  sessionParticipantSchema,
  SessionTemplate,
  SessionTemplateCreateInput,
  sessionTemplateCreateInputSchema,
  sessionTemplateSchema,
  TimeslotInstance,
} from "./schemas";

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Retrieves a session template with permission validation
 * @param sessionTemplateId - ID of the session template to retrieve
 * @returns Session template with all properties
 * @throws {ConvexError} When template not found or access denied
 */
export const getSessionTemplate = authenticatedQueryWithRLS()({
  args: { sessionTemplateId: zid("sessionTemplates") },
  returns: z.object(withSystemFields("sessionTemplates", sessionTemplateSchema.shape)),
  handler: async (ctx, args) => {
    const sessionTemplate = await getOrThrow(ctx, args.sessionTemplateId);
    const club = await getOrThrow(ctx, sessionTemplate.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    return sessionTemplate;
  },
});

/**
 * Lists session templates for a specific club
 * @param clubId - ID of the club to list templates for
 * @param pagination - Pagination options
 * @returns Paginated list of session templates
 * @throws {ConvexError} When club not found or access denied
 */
export const listSessionTemplates = authenticatedQueryWithRLS()({
  args: { clubId: zid("clubs"), pagination: convexToZod(paginationOptsValidator) },
  returns: paginatedResult(
    z.object(withSystemFields("sessionTemplates", sessionTemplateSchema.shape)),
  ),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    return await dtoListSessionTemplatesForClub(ctx, args.clubId, args.pagination);
  },
});

/**
 * Retrieves a session instance with its participants
 * @param sessionInstanceId - ID of the session instance to retrieve
 * @returns Session instance and list of participants
 * @throws {ConvexError} When instance not found or access denied
 */
export const getSessionInstance = authenticatedQueryWithRLS()({
  args: { sessionInstanceId: zid("sessionInstances") },
  returns: {
    sessionInstance: z.object(withSystemFields("sessionInstances", sessionInstanceSchema.shape)),
    participants: z.array(
      z.object(withSystemFields("sessionParticipants", sessionParticipantSchema.shape)),
    ),
  },
  handler: async (ctx, args) => {
    const sessionInstance = await getOrThrow(ctx, args.sessionInstanceId);
    const participants = await dtoListAllSessionParticipants(ctx, args.sessionInstanceId);
    if (!participants.find((p) => p.userId === ctx.currentUser._id)) {
      await validateSessionAccess(ctx, sessionInstance, ctx.currentUser._id);
    }
    return { sessionInstance, participants };
  },
});

/**
 * Lists session instances for a specific club within a date range
 * @param clubId - ID of the club to list instances for
 * @param filters - Date range filters (fromDate, toDate)
 * @param pagination - Pagination options
 * @returns Paginated list of session instances
 * @throws {ConvexError} When club not found or user not a member
 */
export const listClubSessions = authenticatedQueryWithRLS()({
  args: {
    clubId: zid("clubs"),
    filters: z.object({
      fromDate: z.number(),
      toDate: z.number(),
    }),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(
    z.object(withSystemFields("sessionInstances", sessionInstanceSchema.shape)),
  ),
  handler: async (ctx, args) => {
    const { clubId, filters, pagination } = args;
    await getOrThrow(ctx, clubId);
    const userMembership = await getClubMembershipForUser(ctx, clubId, ctx.currentUser._id);
    if (!userMembership) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }
    return await dtoListSessionInstancesForClub(ctx, clubId, filters, pagination);
  },
});

/**
 * Lists sessions where the current user is participating
 * @param filters - Date range filters (fromDate, toDate)
 * @param pagination - Pagination options
 * @returns Paginated list of sessions user is participating in
 */
export const listMySessions = authenticatedQueryWithRLS()({
  args: {
    filters: z.object({
      fromDate: z.number(),
      toDate: z.number(),
    }),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(
    z.object(withSystemFields("sessionInstances", sessionInstanceSchema.shape)),
  ),
  handler: async (ctx, args) => {
    const { filters, pagination } = args;
    return await dtoListParticipatingSessionInstances(
      ctx,
      ctx.currentUser._id,
      filters,
      pagination,
    );
  },
});

/**
 * Searches for sessions based on query and filters
 * @param query - Optional text search query
 * @param filters - Search filters (date range, clubs, skill level, location)
 * @param pagination - Pagination options
 * @returns Paginated list of matching sessions
 */
export const searchSessions = authenticatedQueryWithRLS()({
  args: {
    query: z.string().optional(),
    filters: sessionInstanceFiltersSchema,
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(
    z.object(withSystemFields("sessionInstances", sessionInstanceSchema.shape)),
  ),
  handler: async (ctx, args) => {
    const { query, filters, pagination } = args;

    const sessions = await ctx.db
      .query("sessionInstances")
      .withIndex("instanceDate", (q) =>
        q.gte("instanceDate", filters.fromDate).lte("instanceDate", filters.toDate),
      )
      .order("asc")
      .paginate(pagination);

    const memberClubIds = await getUserMemberClubIds(ctx, ctx.currentUser._id);
    sessions.page = sessions.page.filter((session) =>
      applySessionFilters(session, filters, query, memberClubIds),
    );

    return sessions;
  },
});

// ============================================================================
// MUTATION FUNCTIONS
// ============================================================================

/**
 * Creates a new session template with automatic instance generation
 * @param input - Session template configuration data
 * @returns ID of the created session template
 * @throws {ConvexError} When validation fails or access denied
 */
export const createSessionTemplate = authenticatedMutationWithRLS()({
  args: { input: sessionTemplateCreateInputSchema },
  returns: zid("sessionTemplates"),
  handler: async (ctx, args) => {
    const club = await getOrThrow(ctx, args.input.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);
    const clubMembers = await ctx.db
      .query("clubMemberships")
      .withIndex("clubUser", (q) => q.eq("clubId", club._id))
      .collect();

    validateSessionTemplate(args.input, club, clubMembers);

    const templateId = await dtoCreateSessionTemplate(ctx, args.input);

    await scheduleTemplateDeactivation(ctx, templateId, args.input);
    await ctx.runMutation(internal.service.sessions.functions._createSessionInstances, {
      sessionTemplateId: templateId,
      startDate: args.input.schedule.startDate!,
    });

    return templateId;
  },
});

/**
 * Generates session instances for an active session template
 * @param sessionTemplateId - ID of the session template
 * @param startDate - Start date for instance generation
 * @param endDate - End date for instance generation
 * @returns Array of generated session instance IDs
 * @throws {ConvexError} When template inactive or access denied
 */
export const generateInstances = authenticatedMutationWithRLS()({
  args: { sessionTemplateId: zid("sessionTemplates"), startDate: z.number(), endDate: z.number() },
  returns: { sessionInstanceIds: z.array(zid("sessionInstances")) },
  handler: async (ctx, args): Promise<{ sessionInstanceIds: Id<"sessionInstances">[] }> => {
    const { sessionTemplateId, startDate, endDate } = args;
    const template = await getOrThrow(ctx, sessionTemplateId);
    const club = await getOrThrow(ctx, template.clubId);
    enforceClubOwnershipOrAdmin(ctx, club);

    if (!template.isActive) {
      throw new ConvexError(SESSION_CANNOT_GENERATE_INSTANCE_DUE_TO_INACTIVE_STATUS_ERROR);
    }

    return await ctx.runMutation(internal.service.sessions.functions._createSessionInstances, {
      sessionTemplateId,
      startDate,
      endDate,
    });
  },
});

/**
 * Joins a user to a session timeslot
 * @param sessionInstanceId - ID of the session instance
 * @param timeslotId - ID of the timeslot to join
 * @returns ID of the participation record
 * @throws {ConvexError} When session full, user banned, or invalid request
 */
export const joinSession = authenticatedMutationWithRLS()({
  args: { sessionInstanceId: zid("sessionInstances"), timeslotId: z.string() },
  returns: zid("sessionParticipants"),
  handler: async (ctx, args): Promise<Id<"sessionParticipants">> => {
    const session = await getOrThrow(ctx, args.sessionInstanceId);
    const club = await getOrThrow(ctx, session.clubId);

    const existingParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.sessionInstanceId,
      ctx.currentUser._id,
      args.timeslotId,
    );

    if (existingParticipation) {
      return existingParticipation._id;
    }

    await validateJoinability(ctx, club, session, ctx.currentUser._id);
    const timeslot = getTimeslotOrThrow(session, args.timeslotId);
    const isWaitlisted = await shouldUserBeWaitlisted(timeslot);

    return await ctx.db.insert("sessionParticipants", {
      userId: ctx.currentUser._id,
      joinedAt: Date.now(),
      sessionInstanceId: args.sessionInstanceId,
      timeslotId: args.timeslotId,
      isWaitlisted,
      instanceDate: session.instanceDate,
    });
  },
});

/**
 * Removes a user from a session timeslot
 * @param sessionInstanceId - ID of the session instance
 * @param timeslotId - ID of the timeslot to leave
 * @throws {ConvexError} When user not participating or session already started
 */
export const leaveSession = authenticatedMutationWithRLS()({
  args: { sessionInstanceId: zid("sessionInstances"), timeslotId: z.string() },
  returns: z.void(),
  handler: async (ctx, args): Promise<void> => {
    const session = await getOrThrow(ctx, args.sessionInstanceId);
    const timeslot = getTimeslotOrThrow(session, args.timeslotId);

    const userParticipation = await findUserParticipationByTimeslotId(
      ctx,
      args.sessionInstanceId,
      ctx.currentUser._id,
      args.timeslotId,
    );

    if (!userParticipation) {
      return;
    }

    // Validate session status
    validateSessionStatusForJoinLeave(session);

    await ctx.db.delete(userParticipation._id);
    await promoteWaitlistedParticipant(ctx, args.sessionInstanceId, args.timeslotId, timeslot);
  },
});

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Creates session instances for a template within a date range
 * @internal
 */

export const _createSessionInstances = internalMutation({
  args: {
    sessionTemplateId: v.id("sessionTemplates"),
    startDate: v.number(),
    endDate: v.optional(v.number()),
  },
  returns: { sessionInstanceIds: v.array(v.id("sessionInstances")) },
  handler: async (ctx, { sessionTemplateId, startDate, endDate }) => {
    const template = await getOrThrow(ctx, sessionTemplateId);
    const instanceDates = generateInstanceDates(template, startDate, endDate);

    const instanceIds = await Promise.all(
      instanceDates.map(async (date) => {
        const instanceId = await createInstanceFromTemplate(ctx, template, sessionTemplateId, date);
        if (instanceId) {
          const instance = await getOrThrow(ctx, instanceId);
          await insertPermanentParticipants(ctx, instance);
          await scheduleStatusTransitions(ctx, template, instanceId, date);
        }
        return instanceId;
      }),
    );

    await scheduleNextBatch(ctx, template, sessionTemplateId, instanceDates);
    return { sessionInstanceIds: instanceIds };
  },
});

/**
 * Updates session instance status
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
 * Deactivates a session template
 * @internal
 */
export const _deactivateSession = internalMutation({
  args: {
    sessionTemplateId: v.id("sessionTemplates"),
  },
  handler: async (ctx, { sessionTemplateId }) => {
    await ctx.db.patch(sessionTemplateId, { isActive: false });
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a session instance from a template for a specific date
 */
const createInstanceFromTemplate = async (
  ctx: MutationCtx,
  template: SessionTemplate,
  templateId: Id<"sessionTemplates">,
  instanceDate: number,
): Promise<Id<"sessionInstances">> => {
  const existing = await dtoGetSessionInstanceAtDate(ctx, templateId, instanceDate);
  if (existing) {
    console.warn(`Session instance for ${new Date(instanceDate).toDateString()} already exists.`);
    return existing._id;
  }
  return await dtoCreateSessionInstance(ctx, template, templateId, instanceDate);
};

/**
 * Schedules automatic status transitions for a session instance
 */
const scheduleStatusTransitions = async (
  ctx: MutationCtx,
  template: SessionTemplate,
  instanceId: Id<"sessionInstances">,
  instanceDate: number,
): Promise<void> => {
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
      { sessionInstanceId: instanceId, status: SESSION_STATUS.IN_PROGRESS },
    ),
    ctx.scheduler.runAt(endTime, internal.service.sessions.functions._updateSessionInstanceStatus, {
      sessionInstanceId: instanceId,
      status: SESSION_STATUS.COMPLETED,
    }),
  ]);
};

/**
 * Generates instance dates based on template recurrence pattern
 */
const generateInstanceDates = (
  template: SessionTemplate,
  startDate: number,
  endDate?: number,
): number[] => {
  if (template.recurrence === SESSION_RECURRENCE.ONE_TIME && template.schedule.date) {
    return [getStartOfDayInTimezone(template.schedule.date, template.location.timezone).getTime()];
  }

  if (!startDate || !template.schedule.endDate) {
    throw new ConvexError(SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR);
  }

  const finalEndDate = endDate
    ? Math.min(endDate, template.schedule.endDate)
    : template.schedule.endDate;

  const dates: number[] = [];
  const startDateInTz = toZonedTime(startDate, template.location.timezone);
  const endDateInTz = toZonedTime(finalEndDate, template.location.timezone);
  const maxInstances = MAX_GENERATED_SESSIONS_FOR_RECURRENCE[template.recurrence] || 0;

  for (let i = 0; i < maxInstances; i++) {
    const instanceDateInTz = calculateNextInstanceDate(template.recurrence, startDateInTz, i);
    if (!instanceDateInTz || instanceDateInTz > endDateInTz) break;

    const instanceDateUtc = fromZonedTime(instanceDateInTz, template.location.timezone);
    dates.push(instanceDateUtc.getTime());
  }

  return dates;
};

/**
 * Adds permanent participants to a session instance
 */
const insertPermanentParticipants = async (
  ctx: MutationCtx,
  instance: SessionInstance,
): Promise<Array<Id<"sessionParticipants">>> => {
  const participants = instance.timeslots.flatMap((timeslot) =>
    timeslot.permanentParticipants.map(
      async (userId) =>
        await ctx.db.insert("sessionParticipants", {
          userId,
          joinedAt: instance.instanceDate,
          sessionInstanceId: instance._id,
          timeslotId: timeslot.id,
          isWaitlisted: false,
          instanceDate: instance.instanceDate,
        }),
    ),
  );
  return Promise.all(participants);
};

/**
 * Validates session visibility permissions for a user
 */
const validateSessionAccess = async (
  ctx: QueryCtx,
  session: SessionInstance,
  userId: Id<"users">,
): Promise<void> => {
  if (session.visibility === SESSION_VISIBILITY.PUBLIC) {
    return;
  }

  if (session.visibility === SESSION_VISIBILITY.MEMBERS_ONLY) {
    const club = await getOrThrow(ctx, session.clubId);
    const membership = await getClubMembershipForUser(ctx, club._id, userId);
    if (!membership) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }
  }
};

/**
 * Gets club IDs where user is a member
 */
const getUserMemberClubIds = async (ctx: QueryCtx, userId: Id<"users">): Promise<Id<"clubs">[]> => {
  const memberships = await ctx.db
    .query("clubMemberships")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  return memberships.map((m) => m.clubId);
};

/**
 * Applies search filters to a session
 */
const applySessionFilters = (
  session: SessionInstance,
  filters: SessionInstanceFilters,
  query?: string,
  memberClubIds?: Id<"clubs">[],
): boolean => {
  if (
    session.visibility === SESSION_VISIBILITY.MEMBERS_ONLY &&
    memberClubIds &&
    !memberClubIds.includes(session.clubId)
  ) {
    return false;
  }

  if (filters.clubIds && !filters.clubIds.includes(session.clubId)) return false;
  if (filters.skillLevelMin !== undefined && session.levelRange.max < filters.skillLevelMin)
    return false;
  if (filters.skillLevelMax !== undefined && session.levelRange.min > filters.skillLevelMax)
    return false;
  if (
    filters.location &&
    !session.location.name.toLowerCase().includes(filters.location.toLowerCase())
  ) {
    return false;
  }

  if (query) {
    const searchText = query.toLowerCase();
    return (
      session.name.toLowerCase().includes(searchText) ||
      (session.description?.toLowerCase().includes(searchText) ?? false)
    );
  }

  return true;
};

/**
 * Schedules template deactivation at end date
 */
const scheduleTemplateDeactivation = async (
  ctx: MutationCtx,
  templateId: Id<"sessionTemplates">,
  input: SessionTemplateCreateInput,
): Promise<void> => {
  const deactivationDate =
    input.recurrence === SESSION_RECURRENCE.ONE_TIME
      ? input.schedule.date!
      : input.schedule.endDate!;
  const endDateInTimezone = getStartOfDayInTimezone(deactivationDate, input.location.timezone);
  await ctx.scheduler.runAt(
    endDateInTimezone.getTime(),
    internal.service.sessions.functions._deactivateSession,
    { sessionTemplateId: templateId },
  );
};

/**
 * Validates join permissions (ban status, visibility, session status)
 */
const validateJoinability = async (
  ctx: AuthenticatedWithProfileCtx,
  club: Club,
  session: SessionInstance,
  userId: Id<"users">,
): Promise<void> => {
  const ban = await getClubBanRecordForUser(ctx, club._id, userId);
  if (ban) {
    throw new ConvexError(CLUB_USER_BANNED_ERROR);
  }

  await validateSessionAccess(ctx, session, userId);
  validateSessionStatusForJoinLeave(session);
};

/**
 * Validates and returns timeslot
 */
const getTimeslotOrThrow = (session: SessionInstance, timeslotId: string): TimeslotInstance => {
  const timeslot = session.timeslots.find((ts) => ts.id === timeslotId);
  if (!timeslot) {
    throw new ConvexError(SESSION_TIMESLOT_INVALID_ID_ERROR);
  }
  return timeslot;
};

/**
 * Determines if user should be waitlisted
 */
const shouldUserBeWaitlisted = async (timeslot: TimeslotInstance): Promise<boolean> => {
  if (timeslot.numParticipants >= timeslot.maxParticipants) {
    if (timeslot.numWaitlisted >= timeslot.maxWaitlist) {
      throw new ConvexError(SESSION_TIMESLOT_FULL_ERROR);
    }
    return true;
  }
  return false;
};

/**
 * Finds user participation in timeslot
 */
const findUserParticipationByTimeslotId = async (
  ctx: QueryCtx,
  sessionInstanceId: Id<"sessionInstances">,
  userId: Id<"users">,
  timeslotId: string,
): Promise<SessionParticipant | undefined> => {
  const participations = await dtoListSessionParticipationsForUser(ctx, sessionInstanceId, userId);
  const participation = participations.find((p) => p.timeslotId === timeslotId);
  return participation;
};

/**
 * Promotes next waitlisted participant
 */
const promoteWaitlistedParticipant = async (
  ctx: MutationCtx,
  sessionInstanceId: Id<"sessionInstances">,
  timeslotId: string,
  timeslot: TimeslotInstance,
): Promise<void> => {
  const participants = await dtoListAllSessionParticipants(ctx, sessionInstanceId);
  const timeslotParticipants = participants.filter((p) => p.timeslotId === timeslotId);

  if (timeslotParticipants.length < timeslot.maxParticipants) {
    const waitlisted = timeslotParticipants.filter((p) => p.isWaitlisted);
    if (waitlisted.length > 0) {
      const nextParticipant = waitlisted.reduce((earliest, current) =>
        current.joinedAt < earliest.joinedAt ? current : earliest,
      );
      await ctx.db.patch(nextParticipant._id, { isWaitlisted: false, joinedAt: Date.now() });
    }
  }
};

/**
 * Calculates next instance date based on recurrence
 */
const calculateNextInstanceDate = (
  recurrence: string,
  startDate: Date,
  iteration: number,
): Date | null => {
  switch (recurrence) {
    case SESSION_RECURRENCE.DAILY:
      return addDays(startDate, iteration);
    case SESSION_RECURRENCE.WEEKLY:
      return addWeeks(startDate, iteration);
    case SESSION_RECURRENCE.MONTHLY:
      return addMonths(startDate, iteration);
    default:
      return null;
  }
};

/**
 * Schedules next batch of instance creation
 */
const scheduleNextBatch = async (
  ctx: MutationCtx,
  template: SessionTemplate,
  templateId: Id<"sessionTemplates">,
  instanceDates: number[],
): Promise<void> => {
  if (template.recurrence !== SESSION_RECURRENCE.ONE_TIME && instanceDates.length > 0) {
    const nextScheduleDate = Math.max(...instanceDates);
    const scheduleId = await ctx.scheduler.runAt(
      nextScheduleDate,
      internal.service.sessions.functions._createSessionInstances,
      { sessionTemplateId: templateId, startDate: nextScheduleDate },
    );
    await ctx.db.patch(templateId, { next_scheduled_id: scheduleId });
  }
};
