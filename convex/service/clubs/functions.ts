import { Id } from "@/convex/_generated/dataModel";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR,
  CLUB_MEMBERSHIP_NOT_FOUND_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR,
  CLUB_OWNER_CANNOT_LEAVE_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
} from "@/convex/constants/errors";
import { listActivitiesForResource as dtoListActivitiesForResource } from "@/convex/service/activities/database";
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
  validateClubName,
} from "@/convex/service/utils/validators/clubs";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { convexToZod, zid } from "convex-helpers/server/zod";
import { paginationOptsValidator, WithoutSystemFields } from "convex/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import {
  createClub as dtoCreateClub,
  deleteAllClubMemberships as dtoDeleteAllClubMemberships,
  getClubOrThrow as dtoGetClubOrThrow,
  getMyClubMembership as dtoGetMyClubMembership,
  listMyClubs as dtoListMyClubs,
  listPublicClubs as dtoListPublicClubs,
  updateClub as dtoUpdateClub,
} from "./database";
import {
  Club,
  clubCreateInputSchema,
  ClubMembership,
  ClubMembershipInput,
  clubMembershipInputSchema,
  clubMembershipUpdateInputSchema,
  clubUpdateInputSchema,
} from "./schemas";

/**
 * Lists all public and approved clubs with pagination.
 * @returns Paginated list of public clubs
 */
export const listPublicClubs = publicQueryWithRLS()({
  args: { pagination: convexToZod(paginationOptsValidator) },
  handler: async (ctx, args) => {
    return await dtoListPublicClubs(ctx, args.pagination);
  },
});

/**
 * Lists all clubs that the authenticated user is a member of with pagination.
 * @returns Paginated list of user's clubs with membership details
 */
export const listMyClubs = authenticatedQueryWithRLS()({
  args: { pagination: convexToZod(paginationOptsValidator) },
  handler: async (ctx, args) => {
    return await dtoListMyClubs(ctx, args.pagination);
  },
});

/**
 * Gets a specific club by ID.
 * @returns Club details
 * @throws ConvexError when club doesn't exist
 */
export const getClub = publicQueryWithRLS()({
  args: {
    clubId: zid("clubs"),
  },
  handler: async (ctx, args) => {
    return await dtoGetClubOrThrow(ctx, args.clubId);
  },
});

/**
 * Allows an authenticated user to join a club with membership details.
 * By default, the user membership is non-admin and not approved.
 * @returns Membership ID
 * @throws ConvexError when club doesn't exist or user is already a member
 */
export const joinClub = authenticatedMutationWithRLS()({
  args: {
    clubId: zid("clubs"),
    membershipInfo: clubMembershipInputSchema,
  },
  handler: async (ctx, args) => {
    // Rate limit current user from joining this club
    const rateLimitKey = ctx.currentUser._id + args.clubId;
    await enforceRateLimit(ctx, "joinClub", rateLimitKey);
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    if (club.numMembers >= club.maxMembers) {
      throw new ConvexError(CLUB_FULL_ERROR);
    }
    if (club.isPublic && !club.isApproved) {
      throw new ConvexError(CLUB_PUBLIC_UNAPPROVED_ERROR);
    }
    return await addCurrentUserToClub(ctx, args.clubId, {
      membershipInfo: args.membershipInfo,
    });
  },
});

/**
 * Removes the currently authenticated user from a club.
 * @throws ConvexError when club doesn't exist or user is not a member
 */
export const leaveClub = authenticatedMutationWithRLS()({
  args: {
    clubId: zid("clubs"),
  },
  handler: async (ctx, args) => {
    return await removeCurrentUserFromClub(ctx, args.clubId);
  },
});

/**
 * Creates a new club with the authenticated user as the admin creator.
 * @returns Club ID
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
    await addCurrentUserToClub(ctx, clubId, {
      joinAsAdmin: true,
      membershipInfo: args.membershipInfo,
    });
    return clubId;
  },
});

/**
 * Updates an existing club with new data.
 * @throws ConvexError when club doesn't exist or user profile is required but missing
 * or user does not have permissions to update the club
 */
export const updateClub = authenticatedMutationWithRLS()({
  args: {
    clubId: zid("clubs"),
    input: clubUpdateInputSchema,
  },
  handler: async (ctx, args) => {
    // Rate limit current user from updating this club
    const rateLimitKey = ctx.currentUser._id + args.clubId;
    await enforceRateLimit(ctx, "updateClub", rateLimitKey);
    // Validate club exists
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    // Validate club name when name or isPublic is being updated
    if (args.input.name || args.input.isPublic !== undefined) {
      const name = args.input.name ?? club.name;
      const isPublic = args.input.isPublic ?? club.isPublic;
      await validateClubName(ctx, name, isPublic);
    }
    // Validate permissions
    await enforceClubOwnershipOrAdmin(ctx, club);
    return await dtoUpdateClub(ctx, args.clubId, args.input);
  },
});

/**
 * Deletes an existing club along with all its related resources (memberships and events).
 * @throws ConvexError when club doesn't exist or user profile is required but missing
 * or user does not have permissions to update the club
 */
export const deleteClub = authenticatedMutationWithRLS()({
  args: {
    clubId: zid("clubs"),
  },
  handler: async (ctx, args) => {
    // Validate club exists
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    // Validate permissions
    await enforceClubOwnershipOrAdmin(ctx, club);
    // Get and delete all memberships within the current club
    await dtoDeleteAllClubMemberships(ctx, args.clubId);
    return await ctx.db.delete(args.clubId);
  },
});

/**
 * Updates a club membership. Only club owner, club admin, or system admin can modify memberships.
 * @throws ConvexError when membership doesn't exist or user lacks permissions
 */
export const updateClubMembership = authenticatedMutationWithRLS()({
  args: {
    membershipId: zid("clubMemberships"),
    input: clubMembershipUpdateInputSchema,
  },
  handler: async (ctx, args) => {
    const key = ctx.currentUser._id + args.membershipId;
    await enforceRateLimit(ctx, "updateClubMembership", key);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new ConvexError(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
    }

    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    return await ctx.db.patch(args.membershipId, args.input);
  },
});

/**
 * Removes a member from a club. Only club owner, club admin, or system admin can remove members.
 * @throws ConvexError when membership doesn't exist or user lacks permissions
 */
export const removeClubMember = authenticatedMutationWithRLS()({
  args: {
    membershipId: zid("clubMemberships"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new ConvexError(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
    }

    const club = await dtoGetClubOrThrow(ctx, membership.clubId);
    await enforceClubMembershipPermissions(ctx, club);

    // Prevent removing club owner
    if (membership.userId === club.createdBy) {
      throw new ConvexError(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    }

    await ctx.db.delete(args.membershipId);

    // Decrement club member count
    if (club.numMembers > 0) {
      await dtoUpdateClub(ctx, membership.clubId, { numMembers: club.numMembers - 1 });
    }
  },
});

/**
 * Approves multiple pending club memberships. Only club owner, club admin, or system admin can approve.
 * @returns Number of memberships approved
 */
export const approveClubMemberships = authenticatedMutationWithRLS()({
  args: {
    membershipIds: z.array(zid("clubMemberships")),
  },
  handler: async (ctx, args) => {
    const { memberships } = await validateBulkMemberships(ctx, args.membershipIds);
    if (memberships.length === 0) return 0;

    let approvedCount = 0;
    for (const membership of memberships) {
      if (!membership.isApproved) {
        await ctx.db.patch(membership._id, { isApproved: true });
        approvedCount++;
      }
    }
    return approvedCount;
  },
});

/**
 * Removes multiple members from a club. Only club owner, club admin, or system admin can remove.
 * @returns Number of members removed
 */
export const bulkRemoveMembers = authenticatedMutationWithRLS()({
  args: {
    membershipIds: z.array(zid("clubMemberships")),
  },
  handler: async (ctx, args) => {
    const { memberships, club } = await validateBulkMemberships(ctx, args.membershipIds);
    if (memberships.length === 0 || !club) return 0;

    const ownerMembership = memberships.find((m) => m.userId === club.createdBy);
    if (ownerMembership) {
      throw new ConvexError(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    }

    // Remove all memberships (owner check already done in validation)
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    const removedCount = memberships.length;
    if (removedCount > 0 && club.numMembers >= removedCount) {
      await dtoUpdateClub(ctx, club._id, { numMembers: club.numMembers - removedCount });
    }
    return removedCount;
  },
});

/**
 * Lists activities for a club.
 * Only members can see club activities.
 * @returns Paginated list of club activities
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
 * Removes the current authenticated user from a club and updates member count.
 * @param ctx Authenticated context with profile
 * @param clubId ID of the club to leave
 * @throws Error when club doesn't exist or user is not a member
 */
const removeCurrentUserFromClub = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
): Promise<void> => {
  // Validate club exists
  const club = await dtoGetClubOrThrow(ctx, clubId);
  // Validate user not club owner
  if (club.createdBy === ctx.currentUser._id) {
    throw new ConvexError(CLUB_OWNER_CANNOT_LEAVE_ERROR);
  }
  // Validate user is already a member
  const existingMembership = await ctx.db
    .query("clubMemberships")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", ctx.currentUser._id))
    .unique();
  if (!existingMembership) {
    throw new ConvexError(CLUB_MEMBERSHIP_REQUIRED_ERROR);
  }
  // Remove current user from club
  await ctx.db.delete(existingMembership._id);
  // Decrement club member count
  if (club.numMembers > 0) {
    await dtoUpdateClub(ctx, clubId, { numMembers: club.numMembers - 1 });
  }
};

/**
 * Adds the current authenticated user to a club with specified options and updates member count.
 * @param ctx Authenticated context with profile
 * @param clubId ID of the club to join
 * @param options Join options including admin status and membership info
 * @returns ID of the created club membership
 * @throws Error when club doesn't exist or user is already a member
 */
const addCurrentUserToClub = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
  options?: { joinAsAdmin?: boolean; membershipInfo?: ClubMembershipInput },
): Promise<Id<"clubMemberships">> => {
  // Validate club exists
  const club = await dtoGetClubOrThrow(ctx, clubId);
  // Validate user is not already a member
  const existingMembership = await ctx.db
    .query("clubMemberships")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", ctx.currentUser._id))
    .unique();
  if (existingMembership) {
    throw new ConvexError(CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR);
  }
  // Add current user as member
  const currentUserMembershipInfo = createClubMembershipInfo(
    ctx.currentUser,
    clubId,
    options?.membershipInfo,
  );
  const membership = await ctx.db.insert("clubMemberships", {
    ...currentUserMembershipInfo,
    isApproved: options?.joinAsAdmin ? true : false,
    isClubAdmin: options?.joinAsAdmin ? true : false,
    joinedAt: Date.now(),
  });
  // Increment club member count
  await dtoUpdateClub(ctx, clubId, { numMembers: club.numMembers + 1 });
  return membership;
};

/**
 * Creates club membership information.
 * If membership info is not provided, use current user's profile values.
 * @param currentUser Authenticated user with profile details
 * @param clubId ID of the club to create membership for
 * @param membershipInfo Optional membership details to override profile defaults
 * @returns Complete club membership object with defaults applied
 */
const createClubMembershipInfo = (
  currentUser: UserDetailsWithProfile,
  clubId: Id<"clubs">,
  membershipInfo?: ClubMembershipInput,
): WithoutSystemFields<ClubMembership> => {
  const { name, gender, skillLevel, preferredPlayStyle } = membershipInfo || {};
  return {
    clubId: clubId,
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

/**
 * Validates and returns memberships for bulk operations
 */
const validateBulkMemberships = async (
  ctx: AuthenticatedWithProfileCtx,
  membershipIds: Id<"clubMemberships">[],
): Promise<{ memberships: ClubMembership[]; club: Club | null }> => {
  if (membershipIds.length === 0) return { memberships: [], club: null };

  const memberships = await Promise.all(membershipIds.map((id) => ctx.db.get(id)));
  const validMemberships = memberships.filter(Boolean) as ClubMembership[];

  if (validMemberships.length === 0) return { memberships: [], club: null };

  const clubId = validMemberships[0].clubId;
  const allSameClub = validMemberships.every((m) => m.clubId === clubId);
  if (!allSameClub) {
    throw new ConvexError(CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR);
  }

  const club = await dtoGetClubOrThrow(ctx, clubId);
  await enforceClubMembershipPermissions(ctx, club);

  return { memberships: validMemberships, club };
};
