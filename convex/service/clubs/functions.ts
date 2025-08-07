import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_CANNOT_BAN_OWNER_ERROR,
  CLUB_CANNOT_BAN_SELF_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_OWNER_CANNOT_LEAVE_ERROR,
  CLUB_USER_BANNED_ERROR,
  CLUB_USER_NOT_BANNED_ERROR,
} from "@/convex/constants/errors";
import {
  createActivity as dtoCreateActivity,
  listActivitiesForResource as dtoListActivitiesForResource,
} from "@/convex/service/activities/database";
import { UserDetailsWithProfile } from "@/convex/service/users/schemas";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
  AuthenticatedWithProfileCtx,
  publicQueryWithRLS,
} from "@/convex/service/utils/functions";
import {
  enforceClubMembershipPermissions,
  enforceClubOwnershipOrAdmin,
  validateBulkMemberships,
  validateClubJoinability,
  validateClubName,
  validateClubUpdateInput,
  validateMembershipExists,
} from "@/convex/service/utils/validators/clubs";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { convexToZod, zid } from "convex-helpers/server/zod";
import { paginationOptsValidator, WithoutSystemFields } from "convex/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { ActivityMetadata } from "../activities/schemas";
import { getMetadata } from "../utils/metadata";
import {
  createClub as dtoCreateClub,
  deleteAllClubMemberships as dtoDeleteAllClubMemberships,
  getClubBanRecordForUser as dtoGetClubBanRecordForUser,
  getClubOrThrow as dtoGetClubOrThrow,
  getMyClubMembership as dtoGetMyClubMembership,
  listMyClubs as dtoListMyClubs,
  listPublicClubs as dtoListPublicClubs,
  updateClub as dtoUpdateClub,
} from "./database";
import {
  Club,
  clubBanReasonSchema,
  clubCreateInputSchema,
  ClubMembership,
  ClubMembershipInput,
  clubMembershipInputSchema,
  clubMembershipUpdateInputSchema,
  clubUpdateInputSchema,
} from "./schemas";

interface AddUserToClubOptions {
  isApproved?: boolean;
  isAdmin?: boolean;
  membershipInfo?: ClubMembershipInput;
}

/**
 * Club queries
 */

/**
 * Lists all public and approved clubs with pagination.
 * @param pagination - Pagination options (cursor, numItems)
 * @returns Paginated result of public clubs
 */
export const listPublicClubs = publicQueryWithRLS()({
  args: { pagination: convexToZod(paginationOptsValidator) },
  handler: async (ctx, args) => await dtoListPublicClubs(ctx, args.pagination),
});

/**
 * Lists all clubs that the authenticated user is a member of with pagination.
 * @param pagination - Pagination options (cursor, numItems)
 * @returns Paginated result of user's clubs with membership details
 */
export const listMyClubs = authenticatedQueryWithRLS()({
  args: { pagination: convexToZod(paginationOptsValidator) },
  handler: async (ctx, args) => await dtoListMyClubs(ctx, args.pagination),
});

/**
 * Gets a specific club by ID.
 * @param clubId - ID of the club to retrieve
 * @returns Club details
 * @throws ConvexError when club doesn't exist
 */
export const getClub = publicQueryWithRLS()({
  args: { clubId: zid("clubs") },
  handler: async (ctx, args) => await dtoGetClubOrThrow(ctx, args.clubId),
});

/**
 * Lists activities for a club. Only members can see club activities.
 * @param clubId - ID of the club
 * @param pagination - Pagination options (cursor, numItems)
 * @returns Paginated list of club activities
 * @throws ConvexError when user is not a club member
 */
export const listClubActivities = authenticatedQueryWithRLS()({
  args: {
    clubId: zid("clubs"),
    pagination: convexToZod(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    await dtoGetClubOrThrow(ctx, args.clubId);
    const membership = await dtoGetMyClubMembership(ctx, args.clubId);

    if (!membership) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }

    return await dtoListActivitiesForResource(ctx, args.clubId, args.pagination);
  },
});

/**
 * Club mutations
 */

/**
 * Allows an authenticated user to join a club with membership details.
 * By default, the user membership is non-admin and not approved.
 * @param clubId - ID of the club to join
 * @param membershipInfo - Optional membership details
 * @returns Membership details
 * @throws ConvexError when club doesn't exist, user is banned, club is full, or user is already a member
 */
export const joinClub = authenticatedMutationWithRLS()({
  args: {
    clubId: zid("clubs"),
    membershipInfo: clubMembershipInputSchema.optional(),
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "joinClub", ctx.currentUser._id + args.clubId);
    const club = await dtoGetClubOrThrow(ctx, args.clubId);

    const existingBan = await dtoGetClubBanRecordForUser(ctx, club._id, ctx.currentUser._id);
    if (existingBan) {
      throw new ConvexError(CLUB_USER_BANNED_ERROR);
    }

    validateClubJoinability(club);

    const { membershipInfo } = await addCurrentUserToClub(ctx, args.clubId, {
      membershipInfo: createClubMembershipInfo(ctx.currentUser, args.clubId, args.membershipInfo),
      isApproved: false,
    });

    await createClubActivity(
      ctx,
      club._id,
      membershipInfo.userId,
      ACTIVITY_TYPES.CLUB_JOIN_REQUEST,
      [{ newValue: membershipInfo.name }],
    );

    return membershipInfo;
  },
});

/**
 * Removes the currently authenticated user from a club.
 * @param clubId - ID of the club to leave
 * @throws ConvexError when club doesn't exist, user is not a member, or user is the club owner
 */
export const leaveClub = authenticatedMutationWithRLS()({
  args: { clubId: zid("clubs") },
  handler: async (ctx, args) => {
    const { clubId } = args;
    const club = await dtoGetClubOrThrow(ctx, clubId);

    if (isClubOwner(club, ctx.currentUser._id)) {
      throw new ConvexError(CLUB_OWNER_CANNOT_LEAVE_ERROR);
    }

    const existingMembership = await ctx.db
      .query("clubMemberships")
      .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", ctx.currentUser._id))
      .unique();

    if (!existingMembership) {
      throw new ConvexError(CLUB_MEMBERSHIP_REQUIRED_ERROR);
    }

    await ctx.db.delete(existingMembership._id);
    await updateMemberCount(ctx, clubId, -1);
    await createClubActivity(
      ctx,
      args.clubId,
      existingMembership.userId,
      ACTIVITY_TYPES.CLUB_LEFT,
      [{ previousValue: existingMembership.name }],
    );
  },
});

/**
 * Creates a new club with the authenticated user as the admin creator.
 * @param input - Club creation data
 * @param membershipInfo - Optional membership details for the creator
 * @returns Club ID
 * @throws ConvexError when club name validation fails
 */
export const createClub = authenticatedMutationWithRLS()({
  args: {
    input: clubCreateInputSchema,
    membershipInfo: clubMembershipInputSchema.optional(),
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "createClub", ctx.currentUser._id);
    await validateClubName(ctx, args.input.name, args.input.isPublic);

    const clubId = await dtoCreateClub(ctx, args.input);

    await createClubActivity(ctx, clubId, ctx.currentUser._id, ACTIVITY_TYPES.CLUB_CREATED, [
      { newValue: args.input.name },
    ]);

    const { membershipInfo } = await addCurrentUserToClub(ctx, clubId, {
      isAdmin: true,
      membershipInfo: args.membershipInfo,
    });

    await createClubActivity(ctx, clubId, membershipInfo.userId, ACTIVITY_TYPES.CLUB_JOINED, [
      { newValue: membershipInfo.name },
    ]);

    return clubId;
  },
});

/**
 * Updates an existing club with new data.
 * @param clubId - ID of the club to update
 * @param input - Club update data
 * @throws ConvexError when club doesn't exist, user lacks permissions, or validation fails
 */
export const updateClub = authenticatedMutationWithRLS()({
  args: {
    clubId: zid("clubs"),
    input: clubUpdateInputSchema,
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateClub", ctx.currentUser._id + args.clubId);
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await validateClubUpdateInput(ctx, args.input, club);

    await dtoUpdateClub(ctx, args.clubId, args.input);
    await createClubActivity(
      ctx,
      args.clubId,
      ctx.currentUser._id,
      ACTIVITY_TYPES.CLUB_UPDATED,
      getMetadata(club, args.input),
    );
  },
});

/**
 * Deletes an existing club along with all its related resources (memberships and events).
 * @param clubId - ID of the club to delete
 * @throws ConvexError when club doesn't exist or user lacks permissions
 */
export const deleteClub = authenticatedMutationWithRLS()({
  args: { clubId: zid("clubs") },
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await dtoDeleteAllClubMemberships(ctx, args.clubId);
    await ctx.db.delete(args.clubId);

    await createClubActivity(ctx, args.clubId, ctx.currentUser._id, ACTIVITY_TYPES.CLUB_DELETED, [
      { previousValue: club.name },
    ]);
  },
});

/**
 * Membership mutations
 */

/**
 * Updates a club membership. Only club owner, club admin, or system admin can modify memberships.
 * @param membershipId - ID of the membership to update
 * @param input - Membership update data
 * @throws ConvexError when membership doesn't exist or user lacks permissions
 */
export const updateClubMembership = authenticatedMutationWithRLS()({
  args: {
    membershipId: zid("clubMemberships"),
    input: clubMembershipUpdateInputSchema,
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateClubMembership", ctx.currentUser._id + args.membershipId);
    const membership = validateMembershipExists(await ctx.db.get(args.membershipId));
    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    await ctx.db.patch(args.membershipId, args.input);
    await createClubActivity(
      ctx,
      club._id,
      membership.userId,
      ACTIVITY_TYPES.CLUB_MEMBERSHIP_UPDATED,
      getMetadata(membership, args.input),
    );
  },
});

/**
 * Removes a member from a club. Only club owner, club admin, or system admin can remove members.
 * @param membershipId - ID of the membership to remove
 * @throws ConvexError when membership doesn't exist, user lacks permissions, or trying to remove club owner
 */
export const removeClubMember = authenticatedMutationWithRLS()({
  args: { membershipId: zid("clubMemberships") },
  handler: async (ctx, args) => {
    const membership = validateMembershipExists(await ctx.db.get(args.membershipId));
    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    if (isClubOwner(club, membership.userId)) {
      throw new ConvexError(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    }

    await ctx.db.delete(args.membershipId);
    await createClubActivity(
      ctx,
      club._id,
      membership.userId,
      ACTIVITY_TYPES.CLUB_MEMBERSHIP_REMOVED,
      [{ previousValue: membership.name }],
    );
    await updateMemberCount(ctx, membership.clubId, -1);
  },
});

/**
 * Approves multiple pending club memberships. Only club owner, club admin, or system admin can approve.
 * @param membershipIds - Array of membership IDs to approve
 * @returns Number of memberships approved
 * @throws ConvexError when memberships don't exist or user lacks permissions
 */
export const approveClubMemberships = authenticatedMutationWithRLS()({
  args: { membershipIds: z.array(zid("clubMemberships")) },
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
        await ctx.db.patch(membership._id, { isApproved: true });
        await createClubActivity(
          ctx,
          membership.clubId,
          membership.userId,
          ACTIVITY_TYPES.CLUB_JOINED,
          [{ newValue: membership.name }],
        );
        approvedCount++;
      }
    }
    return approvedCount;
  },
});

/**
 * Removes multiple members from a club. Only club owner, club admin, or system admin can remove.
 * @param membershipIds - Array of membership IDs to remove
 * @returns Number of members removed
 * @throws ConvexError when memberships don't exist, user lacks permissions, or trying to remove club owner
 */
export const bulkRemoveMembers = authenticatedMutationWithRLS()({
  args: { membershipIds: z.array(zid("clubMemberships")) },
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
      await ctx.db.delete(membership._id);
      await createClubActivity(
        ctx,
        club._id,
        membership.userId,
        ACTIVITY_TYPES.CLUB_MEMBERSHIP_REMOVED,
        [{ previousValue: membership.name }],
      );
    }

    const removedCount = memberships.length;
    if (removedCount > 0 && club.numMembers >= removedCount) {
      await dtoUpdateClub(ctx, club._id, { numMembers: club.numMembers - removedCount });
    }

    return removedCount;
  },
});

/**
 * Bans a club member. Only club owner, club admin, or system admin can ban members.
 * Removes the membership and creates an active ban record.
 * @param membershipId - ID of the membership to ban
 * @param reason - Optional reason for the ban
 * @throws ConvexError when membership doesn't exist, user lacks permissions, trying to ban owner, or trying to ban self
 */
export const banClubMember = authenticatedMutationWithRLS()({
  args: {
    membershipId: zid("clubMemberships"),
    reason: clubBanReasonSchema,
  },
  handler: async (ctx, args) => {
    const membership = validateMembershipExists(await ctx.db.get(args.membershipId));
    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    if (isClubOwner(club, membership.userId)) {
      throw new ConvexError(CLUB_CANNOT_BAN_OWNER_ERROR);
    }
    if (membership.userId === ctx.currentUser._id) {
      throw new ConvexError(CLUB_CANNOT_BAN_SELF_ERROR);
    }

    await ctx.db.delete(args.membershipId);
    await ctx.db.insert("clubBans", {
      clubId: membership.clubId,
      userId: membership.userId,
      bannedBy: ctx.currentUser._id,
      bannedAt: Date.now(),
      reason: args.reason,
      isActive: true,
    });

    await updateMemberCount(ctx, membership.clubId, -1);
    await createClubActivity(ctx, club._id, membership.userId, ACTIVITY_TYPES.CLUB_MEMBER_BANNED, [
      { newValue: args.reason },
    ]);
  },
});

/**
 * Unbans a club member. Only club owner, club admin, or system admin can unban members.
 * Deactivates the ban record allowing the user to rejoin.
 * @param clubId - ID of the club
 * @param userId - ID of the user to unban
 * @throws ConvexError when club doesn't exist, user lacks permissions, or user is not banned
 */
export const unbanClubMember = authenticatedMutationWithRLS()({
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

    await ctx.db.patch(ban._id, { isActive: false });
    await createClubActivity(ctx, args.clubId, args.userId, ACTIVITY_TYPES.CLUB_MEMBER_UNBANNED, [
      { previousValue: ban.reason },
    ]);
  },
});

/**
 * Lists banned users for a club. Only club owner, club admin, or system admin can view bans.
 * @param clubId - ID of the club
 * @param pagination - Pagination options (cursor, numItems)
 * @returns Paginated list of banned users
 * @throws ConvexError when club doesn't exist or user lacks permissions
 */
export const listClubBans = authenticatedQueryWithRLS()({
  args: {
    clubId: zid("clubs"),
    pagination: convexToZod(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    return ctx.db
      .query("clubBans")
      .withIndex("clubActive", (q) => q.eq("clubId", args.clubId).eq("isActive", true))
      .paginate(args.pagination);
  },
});

/**
 * Helper functions
 */

/**
 * Creates an activity record for club-related actions.
 * @param ctx - Authenticated context with profile
 * @param resourceId - ID of the club resource
 * @param relatedId - ID of the user related to the activity
 * @param type - Type of activity from ACTIVITY_TYPES
 * @param metadata - Optional metadata for the activity
 */
const createClubActivity = async (
  ctx: AuthenticatedWithProfileCtx,
  resourceId: Id<"clubs">,
  relatedId: Id<"users">,
  type: string,
  metadata?: ActivityMetadata,
) => {
  await dtoCreateActivity(ctx, {
    resourceId,
    relatedId,
    type,
    createdBy: ctx.currentUser._id,
    createdAt: Date.now(),
    metadata,
  });
};

/**
 * Updates the member count for a club by a given delta.
 * @param ctx - Authenticated context with profile
 * @param clubId - ID of the club to update
 * @param delta - Change in member count (positive or negative)
 */
const updateMemberCount = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
  delta: number,
) => {
  const club = await dtoGetClubOrThrow(ctx, clubId);
  const newCount = Math.max(0, club.numMembers + delta);
  if (newCount !== club.numMembers) {
    await dtoUpdateClub(ctx, clubId, { numMembers: newCount });
  }
};

/**
 * Checks if a user is the owner of a club.
 * @param club - The club to check
 * @param userId - ID of the user to check
 * @returns True if the user is the club owner
 */
const isClubOwner = (club: Club, userId: Id<"users">): boolean => {
  return club.createdBy === userId;
};

/**
 * Adds the current authenticated user to a club with specified options and updates member count.
 * @param ctx - Authenticated context with profile
 * @param clubId - ID of the club to join
 * @param options - Join options including admin status, approval status and membership info
 * @returns Object containing membership info and membership ID
 * @throws ConvexError when club doesn't exist or user is already a member
 */
const addCurrentUserToClub = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
  options?: AddUserToClubOptions,
): Promise<{
  membershipInfo: WithoutSystemFields<ClubMembership>;
  membershipId: Id<"clubMemberships">;
}> => {
  const club = await dtoGetClubOrThrow(ctx, clubId);

  const existingMembership = await ctx.db
    .query("clubMemberships")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", ctx.currentUser._id))
    .unique();

  if (existingMembership) {
    throw new ConvexError(CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR);
  }

  const currentUserMembershipInfo = {
    ...createClubMembershipInfo(ctx.currentUser, clubId, options?.membershipInfo),
    isApproved: options?.isAdmin ? true : !!options?.isApproved,
    isClubAdmin: !!options?.isAdmin,
    joinedAt: Date.now(),
  };

  const membershipId = await ctx.db.insert("clubMemberships", currentUserMembershipInfo);
  await dtoUpdateClub(ctx, clubId, { numMembers: club.numMembers + 1 });

  return { membershipInfo: currentUserMembershipInfo, membershipId };
};

/**
 * Creates club membership information.
 * If membership info is not provided, use current user's profile values.
 * @param currentUser - Authenticated user with profile details
 * @param clubId - ID of the club to create membership for
 * @param membershipInfo - Optional membership details to override profile defaults
 * @returns Complete club membership object with defaults applied
 */
const createClubMembershipInfo = (
  currentUser: UserDetailsWithProfile,
  clubId: Id<"clubs">,
  membershipInfo?: ClubMembershipInput,
): WithoutSystemFields<ClubMembership> => {
  const { name, gender, skillLevel, preferredPlayStyle } = membershipInfo || {};
  return {
    clubId,
    userId: currentUser._id,
    name: name || `${currentUser.profile.firstName} ${currentUser.profile.lastName}`,
    gender: gender || currentUser.profile.gender,
    skillLevel: skillLevel || currentUser.profile.skillLevel,
    preferredPlayStyle: preferredPlayStyle || currentUser.profile.preferredPlayStyle,
    isApproved: false,
    isClubAdmin: false,
    joinedAt: Date.now(),
  };
};
