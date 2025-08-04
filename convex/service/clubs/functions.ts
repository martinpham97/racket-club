import { Id } from "@/convex/_generated/dataModel";
import {
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
} from "@/convex/constants/errors";
import { convexToZod, zid } from "convex-helpers/server/zod";
import { paginationOptsValidator, WithoutSystemFields } from "convex/server";
import { ConvexError } from "convex/values";
import { UserDetailsWithProfile } from "../users/schemas";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
  AuthenticatedWithProfileCtx,
  publicQueryWithRLS,
} from "../utils/functions";
import { enforceClubOwnershipOrAdmin } from "../utils/validators/clubs";
import {
  createClub as dtoCreateClub,
  getClubOrThrow as dtoGetClubOrThrow,
  listMyClubs as dtoListMyClubs,
  listPublicClubs as dtoListPublicClubs,
  updateClub as dtoUpdateClub,
} from "./database";
import {
  clubCreateInputSchema,
  ClubMembership,
  ClubMembershipInput,
  clubMembershipInputSchema,
  clubUpdateInputSchema,
} from "./schemas";

/**
 * Lists all public and approved clubs with pagination.
 * @returns Paginated list of public clubs
 */
export const listPublicClubs = publicQueryWithRLS()({
  args: convexToZod(paginationOptsValidator),
  handler: async (ctx, args) => {
    return await dtoListPublicClubs(ctx, args);
  },
});

/**
 * Lists all clubs that the authenticated user is a member of with pagination.
 * @returns Paginated list of user's clubs with membership details
 */
export const listMyClubs = authenticatedQueryWithRLS()({
  args: convexToZod(paginationOptsValidator),
  handler: async (ctx, args) => {
    return await dtoListMyClubs(ctx, args);
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
    // Validate club exists
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
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
    input: clubUpdateInputSchema,
  },
  handler: async (ctx, args) => {
    // Validate club exists
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    // Validate permissions
    await enforceClubOwnershipOrAdmin(ctx, club);
    // Get and delete all memberships
    const memberships = await ctx.db.query("clubMemberships").collect();
    memberships.forEach(async (membership) => await ctx.db.delete(membership._id));
    return await ctx.db.delete(args.clubId);
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
  // Validate user is already a member
  const existingMembership = await ctx.db
    .query("clubMemberships")
    .withIndex("profileId", (q) => q.eq("profileId", ctx.currentUser.profile._id))
    .unique();
  if (!existingMembership) {
    throw new Error(CLUB_MEMBERSHIP_REQUIRED_ERROR);
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
    .withIndex("profileId", (q) => q.eq("profileId", ctx.currentUser.profile._id))
    .unique();
  if (existingMembership) {
    throw new Error(CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR);
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
    profileId: currentUser.profile._id,
    name: name || `${currentUser.profile.firstName} ${currentUser.profile.lastName}`,
    gender: gender || currentUser.profile.gender,
    skillLevel: skillLevel || currentUser.profile.skillLevel,
    preferredPlayStyle: preferredPlayStyle || currentUser.profile.preferredPlayStyle,
    isApproved: false,
    isClubAdmin: false,
    joinedAt: Date.now(),
  };
};
