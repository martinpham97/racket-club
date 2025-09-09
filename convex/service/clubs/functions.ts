import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  CLUB_CANNOT_BAN_OWNER_ERROR,
  CLUB_CANNOT_BAN_SELF_ERROR,
  CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR,
  CLUB_OWNER_CANNOT_LEAVE_ERROR,
  CLUB_USER_NOT_BANNED_ERROR,
} from "@/convex/constants/errors";
import { authenticatedMutation, authenticatedQuery, publicQuery } from "@/convex/functions";
import {
  createActivity as dtoCreateActivity,
  listActivitiesForResource as dtoListActivitiesForResource,
} from "@/convex/service/activities/database";
import { activitySchema } from "@/convex/service/activities/schemas";
import { getMetadata } from "@/convex/service/utils/metadata";
import { paginatedResult } from "@/convex/service/utils/pagination";
import {
  enforceClubMembershipPermissions,
  enforceClubOwnershipOrAdmin,
  isClubOwner,
  validateBulkMemberships,
  validateClubJoinability,
  validateClubMembershipExists,
  validateClubName,
  validateClubUpdateInput,
  validateMembershipDoesNotExist,
  validateMembershipExists,
  validateUserNotBanned,
} from "@/convex/service/utils/validators/clubs";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { convexToZod, withSystemFields, zid } from "convex-helpers/server/zod";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import {
  createClub as dtoCreateClub,
  getActiveClubBanRecords as dtoGetActiveClubBanRecords,
  getActiveClubBanRecordForUser as dtoGetClubBanRecordForUser,
  getClubMembershipOrThrow as dtoGetClubMembershipOrThrow,
  getClubOrThrow as dtoGetClubOrThrow,
  listClubsForUser as dtoListClubsForUser,
  listPublicClubs as dtoListPublicClubs,
  updateClub as dtoUpdateClub,
  updateClubMembership as dtoUpdateClubMembership,
} from "./database";
import { addUserToClub, updateClubMemberCount } from "./helpers/membership";
import {
  clubBanReasonSchema,
  clubBanSchema,
  clubCreateInputSchema,
  clubDetailsSchema,
  clubMembershipInputSchema,
  clubMembershipSchema,
  clubMembershipUpdateInputSchema,
  clubSchema,
  clubUpdateInputSchema,
} from "./schemas";

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Lists all public and approved clubs with pagination.
 * @param pagination Pagination options (cursor, numItems)
 * @returns Paginated result of public clubs
 */
export const listPublicClubs = publicQuery()({
  args: { pagination: convexToZod(paginationOptsValidator) },
  returns: paginatedResult(z.object(withSystemFields("clubs", clubSchema.shape))),
  handler: async (ctx, args) => {
    return await dtoListPublicClubs(ctx, args.pagination);
  },
});

/**
 * Lists all clubs that a user is a member of with pagination.
 * @param userId ID of the user to get clubs for
 * @param pagination Pagination options (cursor, numItems)
 * @returns Paginated result of user's clubs with membership details
 */
export const listClubsForUser = authenticatedQuery()({
  args: {
    userId: zid("users"),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(
    z.object(withSystemFields("clubs", clubSchema.shape)).extend({
      membership: z.object(withSystemFields("clubMemberships", clubMembershipSchema.shape)),
    }),
  ),
  handler: async (ctx, args) => {
    return await dtoListClubsForUser(ctx, args.userId, args.pagination);
  },
});

/**
 * Gets a specific club by ID.
 * @param clubId ID of the club to retrieve
 * @returns Club details
 * @throws ConvexError when club doesn't exist
 */
export const getClub = publicQuery()({
  args: { clubId: zid("clubs") },
  returns: z.object(withSystemFields("clubs", clubSchema.shape)),
  handler: async (ctx, args) => {
    return await dtoGetClubOrThrow(ctx, args.clubId);
  },
});

/**
 * Lists activities for a club. Only members can see club activities.
 * @param clubId ID of the club
 * @param pagination Pagination options (cursor, numItems)
 * @returns Paginated list of club activities
 * @throws ConvexError when club is not found user is not a club member
 */
export const listClubActivities = authenticatedQuery()({
  args: {
    clubId: zid("clubs"),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("activities", activitySchema.shape))),
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await validateClubMembershipExists(ctx, club._id, ctx.currentUser._id);

    return await dtoListActivitiesForResource(ctx, args.clubId, args.pagination);
  },
});

/**
 * Lists banned users for a club. Only club owner, club admin, or system admin can view bans.
 * @param clubId ID of the club
 * @param pagination Pagination options (cursor, numItems)
 * @returns Paginated list of banned users
 * @throws ConvexError when club doesn't exist or user lacks permissions
 */
export const listClubBans = authenticatedQuery()({
  args: {
    clubId: zid("clubs"),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("clubBans", clubBanSchema.shape))),
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    return dtoGetActiveClubBanRecords(ctx, club._id, args.pagination);
  },
});

// ============================================================================
// MUTATION FUNCTIONS
// ============================================================================

/**
 * Allows an authenticated user to request to join a club with membership details.
 * By default, the user membership is non-admin and not approved.
 * @param clubId ID of the club to join
 * @param membershipInfo Optional membership details, user's profile info is used if not specified
 * @returns Membership details
 * @throws ConvexError when club doesn't exist, user is banned, club is full, or user is already a member
 */
export const requestToJoinClub = authenticatedMutation()({
  args: {
    clubId: zid("clubs"),
    membershipInfo: clubMembershipInputSchema.optional(),
  },
  returns: z.object(withSystemFields("clubMemberships", clubMembershipSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "joinClub", ctx.currentUser._id + args.clubId);
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    validateClubJoinability(club);
    await validateUserNotBanned(ctx, club._id, ctx.currentUser._id);
    await validateMembershipDoesNotExist(ctx, club._id, ctx.currentUser._id);

    const { membership } = await addUserToClub(ctx, ctx.currentUser, club, {
      membershipInfo: args.membershipInfo,
      isApproved: false,
    });

    await dtoCreateActivity(ctx, {
      resourceId: club._id,
      relatedId: membership.userId,
      type: ACTIVITY_TYPES.CLUB_JOIN_REQUEST,
      metadata: [{ newValue: membership.name }],
    });

    return membership;
  },
});

/**
 * Removes the currently authenticated user from a club.
 * @param clubId ID of the club to leave
 * @throws ConvexError when club doesn't exist, user is not a member, or user is the club owner
 */
export const leaveClub = authenticatedMutation()({
  args: { clubId: zid("clubs") },
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    if (isClubOwner(club, ctx.currentUser._id)) {
      throw new ConvexError(CLUB_OWNER_CANNOT_LEAVE_ERROR);
    }
    const existingMembership = await validateMembershipExists(ctx, club._id, ctx.currentUser._id);

    await ctx.table("clubMemberships").getX(existingMembership._id).delete();

    await updateClubMemberCount(ctx, club, -1);
    await dtoCreateActivity(ctx, {
      resourceId: args.clubId,
      relatedId: existingMembership.userId,
      type: ACTIVITY_TYPES.CLUB_LEFT,
      metadata: [{ previousValue: existingMembership.name }],
    });
  },
});

/**
 * Creates a new club with the authenticated user as the admin creator.
 * @param input Club creation data
 * @param membershipInfo Optional membership details for the creator
 * @returns Club details
 * @throws ConvexError when club name validation fails
 */
export const createClub = authenticatedMutation()({
  args: {
    input: clubCreateInputSchema,
    membershipInfo: clubMembershipInputSchema.optional(),
  },
  returns: clubDetailsSchema,
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "createClub", ctx.currentUser._id);
    await validateClubName(ctx, args.input.name, args.input.isPublic);

    const club = await dtoCreateClub(ctx, args.input, ctx.currentUser._id);

    await dtoCreateActivity(ctx, {
      resourceId: club._id,
      relatedId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.CLUB_CREATED,
      metadata: [{ newValue: args.input.name }],
    });
    const clubDetails = await addUserToClub(ctx, ctx.currentUser, club, {
      isAdmin: true,
      membershipInfo: args.membershipInfo,
    });
    await dtoCreateActivity(ctx, {
      resourceId: club._id,
      relatedId: clubDetails.membership.userId,
      type: ACTIVITY_TYPES.CLUB_JOINED,
      metadata: [{ newValue: clubDetails.membership.name }],
    });

    return clubDetails;
  },
});

/**
 * Updates an existing club with new data.
 * @param clubId ID of the club to update
 * @param input Club update data
 * @returns Updated club details
 * @throws ConvexError when club doesn't exist, user lacks permissions, or validation fails
 */
export const updateClub = authenticatedMutation()({
  args: {
    clubId: zid("clubs"),
    input: clubUpdateInputSchema,
  },
  returns: z.object(withSystemFields("clubs", clubSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateClub", ctx.currentUser._id + args.clubId);
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await validateClubUpdateInput(ctx, args.input, club);

    const updatedClub = await dtoUpdateClub(ctx, args.clubId, {
      ...args.input,
      // If club is changed from private to public, then set its status to not approved
      isApproved: args.input.isPublic ? false : club.isApproved,
    });

    await dtoCreateActivity(ctx, {
      resourceId: args.clubId,
      relatedId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.CLUB_UPDATED,
      metadata: getMetadata(club, args.input),
    });

    return updatedClub;
  },
});

/**
 * Deletes an existing club along with all its related resources (memberships and events).
 * @param clubId ID of the club to delete
 * @throws ConvexError when club doesn't exist or user lacks permissions
 */
export const deleteClub = authenticatedMutation()({
  args: { clubId: zid("clubs") },
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);

    // Related resources deletion is cascaded as specified in schema
    await ctx.table("clubs").getX(args.clubId).delete();

    await dtoCreateActivity(ctx, {
      resourceId: args.clubId,
      relatedId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.CLUB_DELETED,
      metadata: [{ previousValue: club.name }],
    });
  },
});

/**
 * Updates a club membership. Only club owner, club admin, or system admin can modify memberships.
 * @param membershipId ID of the membership to update
 * @param input Membership update data
 * @returns Updated membership details
 * @throws ConvexError when membership doesn't exist or user lacks permissions
 */
export const updateClubMembership = authenticatedMutation()({
  args: {
    membershipId: zid("clubMemberships"),
    input: clubMembershipUpdateInputSchema,
  },
  returns: z.object(withSystemFields("clubMemberships", clubMembershipSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateClubMembership", ctx.currentUser._id + args.membershipId);
    const membership = await dtoGetClubMembershipOrThrow(ctx, args.membershipId);
    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    const updatedMembership = await dtoUpdateClubMembership(ctx, membership._id, args.input);

    await dtoCreateActivity(ctx, {
      resourceId: club._id,
      relatedId: membership.userId,
      type: ACTIVITY_TYPES.CLUB_MEMBERSHIP_UPDATED,
      metadata: getMetadata(membership, args.input),
    });

    return updatedMembership;
  },
});

/**
 * Removes a member from a club. Only club owner, club admin, or system admin can remove members.
 * @param membershipId ID of the membership to remove
 * @throws ConvexError when membership doesn't exist, user lacks permissions, or trying to remove club owner
 */
export const removeClubMember = authenticatedMutation()({
  args: { membershipId: zid("clubMemberships") },
  handler: async (ctx, args) => {
    const membership = await dtoGetClubMembershipOrThrow(ctx, args.membershipId);
    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    if (isClubOwner(club, membership.userId)) {
      throw new ConvexError(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    }

    await ctx.table("clubMemberships").getX(args.membershipId).delete();

    await dtoCreateActivity(ctx, {
      resourceId: club._id,
      relatedId: membership.userId,
      type: ACTIVITY_TYPES.CLUB_MEMBERSHIP_REMOVED,
      metadata: [{ previousValue: membership.name }],
    });

    await updateClubMemberCount(ctx, club, -1);
  },
});

/**
 * Approves multiple pending club memberships. Only club owner, club admin, or system admin can approve.
 * @param membershipIds Array of membership IDs to approve
 * @returns Number of memberships approved
 * @throws ConvexError when memberships don't exist or user lacks permissions
 */
export const approveClubMemberships = authenticatedMutation()({
  args: { membershipIds: z.array(zid("clubMemberships")) },
  returns: z.number(),
  handler: async (ctx, args) => {
    const { memberships, clubId } = await validateBulkMemberships(ctx, args.membershipIds);
    if (memberships.length === 0 || !clubId) {
      return 0;
    }

    const club = await dtoGetClubOrThrow(ctx, clubId);
    await enforceClubMembershipPermissions(ctx, club);

    let approvedCount = 0;
    for (const membership of memberships) {
      if (!membership.isApproved) {
        await ctx.table("clubMemberships").getX(membership._id).patch({ isApproved: true });
        await dtoCreateActivity(ctx, {
          resourceId: membership.clubId,
          relatedId: membership.userId,
          type: ACTIVITY_TYPES.CLUB_JOINED,
          metadata: [{ newValue: membership.name }],
        });
        approvedCount++;
      }
    }
    return approvedCount;
  },
});

/**
 * Removes multiple members from a club. Only club owner, club admin, or system admin can remove.
 * @param membershipIds Array of membership IDs to remove
 * @returns Number of members removed
 * @throws ConvexError when memberships don't exist, user lacks permissions, or trying to remove club owner
 */
export const removeMembers = authenticatedMutation()({
  args: { membershipIds: z.array(zid("clubMemberships")) },
  returns: z.number(),
  handler: async (ctx, args) => {
    const { memberships, clubId } = await validateBulkMemberships(ctx, args.membershipIds);
    if (memberships.length === 0 || !clubId) {
      return 0;
    }

    const club = await dtoGetClubOrThrow(ctx, clubId);
    await enforceClubMembershipPermissions(ctx, club);

    const ownerMembership = memberships.find((m) => isClubOwner(club, m.userId));
    if (ownerMembership) {
      throw new ConvexError(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    }

    for (const membership of memberships) {
      await ctx.table("clubMemberships").getX(membership._id).delete();
      await dtoCreateActivity(ctx, {
        resourceId: club._id,
        relatedId: membership.userId,
        type: ACTIVITY_TYPES.CLUB_MEMBERSHIP_REMOVED,
        metadata: [{ previousValue: membership.name }],
      });
    }

    const removedCount = memberships.length;
    if (removedCount > 0 && club.numMembers >= removedCount) {
      await updateClubMemberCount(ctx, club, -removedCount);
    }

    return removedCount;
  },
});

/**
 * Bans a club member. Only club owner, club admin, or system admin can ban members.
 * Removes the membership and creates an active ban record.
 * @param membershipId ID of the membership to ban
 * @param reason Optional reason for the ban
 * @throws ConvexError when membership doesn't exist, user lacks permissions, trying to ban owner, or trying to ban self
 */
export const banAndRemoveClubMember = authenticatedMutation()({
  args: {
    membershipId: zid("clubMemberships"),
    reason: clubBanReasonSchema,
  },
  handler: async (ctx, args) => {
    const membership = await dtoGetClubMembershipOrThrow(ctx, args.membershipId);
    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    if (isClubOwner(club, membership.userId)) {
      throw new ConvexError(CLUB_CANNOT_BAN_OWNER_ERROR);
    }

    if (membership.userId === ctx.currentUser._id) {
      throw new ConvexError(CLUB_CANNOT_BAN_SELF_ERROR);
    }

    await ctx.table("clubMemberships").getX(args.membershipId).delete();
    await ctx.table("clubBans").insert({
      clubId: membership.clubId,
      userId: membership.userId,
      bannedBy: ctx.currentUser._id,
      bannedAt: Date.now(),
      reason: args.reason,
      isActive: true,
    });

    await updateClubMemberCount(ctx, club, -1);
    await dtoCreateActivity(ctx, {
      resourceId: club._id,
      relatedId: membership.userId,
      type: ACTIVITY_TYPES.CLUB_MEMBER_BANNED,
      metadata: [{ newValue: args.reason }],
    });
  },
});

/**
 * Unbans a user from a club. Only club owner, club admin, or system admin can unban users.
 * Deactivates the ban record allowing the user to rejoin.
 * @param clubId ID of the club
 * @param userId ID of the user to unban
 * @throws ConvexError when club doesn't exist, user lacks permissions, or user is not banned
 */
export const unbanUserFromClub = authenticatedMutation()({
  args: {
    clubId: zid("clubs"),
    userId: zid("users"),
  },
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    const ban = await dtoGetClubBanRecordForUser(ctx, args.clubId, args.userId);
    if (!ban) {
      throw new ConvexError(CLUB_USER_NOT_BANNED_ERROR);
    }

    await ctx.table("clubBans").getX(ban._id).patch({ isActive: false });

    await dtoCreateActivity(ctx, {
      resourceId: args.clubId,
      relatedId: args.userId,
      type: ACTIVITY_TYPES.CLUB_MEMBER_UNBANNED,
      metadata: [{ previousValue: ban.reason }],
    });
  },
});
