import { Id } from "@/convex/_generated/dataModel";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
  CLUB_USER_BANNED_ERROR,
} from "@/convex/constants/errors";
import { AuthenticatedWithProfileCtx } from "@/convex/functions";
import {
  getActiveClubBanRecordForUser,
  getClubMembershipForUser,
} from "@/convex/service/clubs/database";
import { Club, ClubMembership, ClubUpdateInput } from "@/convex/service/clubs/schemas";
import { QueryCtx } from "@/convex/types";
import { ConvexError } from "convex/values";
import { isOwnerOrSystemAdmin } from "./auth";

/**
 * Enforces that the current user has permissions for a given club
 * User must be either the club creator, system admin, or approved club admin.
 * @param ctx - Authenticated context with profile
 * @param club - Club to check permissions for
 * @throws Error when user lacks permissions
 */
export const enforceClubOwnershipOrAdmin = async (ctx: AuthenticatedWithProfileCtx, club: Club) => {
  if (!isOwnerOrSystemAdmin(ctx.currentUser, club.createdBy)) {
    const membership = await getClubMembershipForUser(ctx, club._id, ctx.currentUser._id);
    if (!membership?.isApproved || !membership?.isClubAdmin) {
      throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
    }
  }
};

/**
 * Validates that the current user can manage memberships for the given club.
 * @param ctx Authenticated context with profile
 * @param club Club to check permissions for
 * @throws ConvexError when user lacks permission
 */
export const enforceClubMembershipPermissions = async (
  ctx: AuthenticatedWithProfileCtx,
  club: Club,
): Promise<void> => {
  // System admin can manage any club
  if (ctx.currentUser.profile?.isAdmin) {
    return;
  }

  // Club owner can manage their club
  if (club.createdBy === ctx.currentUser._id) {
    return;
  }

  // Club admin (approved) can manage their club
  const membership = await getClubMembershipForUser(ctx, club._id, ctx.currentUser._id);

  if (membership?.isApproved && membership?.isClubAdmin) {
    return;
  }

  throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
};

/**
 * Validates that public club names are unique
 * @param ctx Query Ctx
 * @param name New club name
 * @param isPublic Whether the club is private or public
 */
export const validateClubName = async (ctx: QueryCtx, name: string, isPublic: boolean) => {
  if (isPublic) {
    const clubWithSameName = await ctx
      .table("clubs", "publicName", (q) => q.eq("isPublic", true).eq("name", name))
      .unique();
    if (clubWithSameName) {
      throw new ConvexError(CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR);
    }
  }
};

/**
 * Validates club name uniqueness if name or visibility is being updated.
 * @param ctx - Authenticated context with profile
 * @param input - Club update input data
 * @param club - Current club data
 * @throws ConvexError when name validation fails
 */
export const validateClubUpdateInput = async (
  ctx: AuthenticatedWithProfileCtx,
  input: ClubUpdateInput,
  club: Club,
) => {
  // Check approval permission first
  if (input.isApproved && !ctx.currentUser.profile.isAdmin) {
    throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
  }

  // Check if we are updating club name or club visibility
  const shouldValidateName = input.name || input.isPublic !== undefined;
  if (!shouldValidateName) {
    return;
  }

  // Infer values from existing club settings if not provided
  const name = input.name ?? club.name;
  const isPublic = input.isPublic ?? club.isPublic;
  await validateClubName(ctx, name, isPublic);
};

/**
 * Validates that a club membership exists for the given user and club.
 * @param ctx Query context
 * @param clubId Club ID to check membership for
 * @param userId User ID to check membership for
 * @returns The validated club membership
 * @throws ConvexError when membership does not exist
 */
export const validateClubMembershipExists = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<ClubMembership> => {
  const membership = await getClubMembershipForUser(ctx, clubId, userId);
  if (!membership) {
    throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
  }
  return membership;
};

/**
 * Validates that a club can be joined by checking capacity and approval status.
 * @param club - The club to validate
 * @throws {ConvexError} when club is full or public but unapproved
 */
export const validateClubJoinability = (club: Club) => {
  if (club.isPublic && !club.isApproved) {
    throw new ConvexError(CLUB_PUBLIC_UNAPPROVED_ERROR);
  }
  if (club.numMembers >= club.maxMembers) {
    throw new ConvexError(CLUB_FULL_ERROR);
  }
};

/**
 * Validates and returns memberships within a club for bulk operations.
 * Ensures all memberships exist and belong to the same club.
 * @param ctx - Query context
 * @param membershipIds - Array of membership IDs to validate
 * @returns Object containing validated memberships and club ID
 * @throws {ConvexError} When memberships are from different clubs
 */
export const validateBulkMemberships = async (
  ctx: QueryCtx,
  membershipIds: Id<"clubMemberships">[],
): Promise<{ memberships: ClubMembership[]; clubId: Id<"clubs"> | null }> => {
  const uniqueIds = [...new Set(membershipIds)];
  if (uniqueIds.length === 0) {
    return { memberships: [], clubId: null };
  }

  const memberships = await ctx.table("clubMemberships").getMany(uniqueIds);
  const validMemberships = memberships.filter(Boolean) as Array<ClubMembership>;

  if (validMemberships.length === 0) {
    return { memberships: [], clubId: null };
  }

  const clubId = validMemberships[0].clubId;
  if (!validMemberships.every((m) => m.clubId === clubId)) {
    throw new ConvexError(CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR);
  }

  return { memberships: validMemberships, clubId };
};

/**
 * Validates that a user is not banned from a club
 * @param ctx Query context
 * @param clubId Club ID to validate
 * @param userId User ID to validate
 * @throws ConvexError When user is banned from the club
 */
export const validateUserNotBanned = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<void> => {
  const ban = await getActiveClubBanRecordForUser(ctx, clubId, userId);
  if (ban) {
    throw new ConvexError(CLUB_USER_BANNED_ERROR);
  }
};

/**
 * Validates that a club membership does not already exist for the given user and club.
 * @param ctx Query context
 * @param clubId Club ID to check membership for
 * @param userId User ID to check membership for
 * @throws ConvexError when membership already exists
 */
export const validateMembershipDoesNotExist = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<void> => {
  const existingMembership = await getClubMembershipForUser(ctx, clubId, userId);
  if (existingMembership) {
    throw new ConvexError(CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR);
  }
};

/**
 * Validates that a club membership exists for the given user and club.
 * @param ctx Query context
 * @param clubId Club ID to check membership for
 * @param userId User ID to check membership for
 * @returns Club membership details
 * @throws ConvexError when membership does not exists
 */
export const validateMembershipExists = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<ClubMembership> => {
  const existingMembership = await getClubMembershipForUser(ctx, clubId, userId);
  if (!existingMembership) {
    throw new ConvexError(CLUB_MEMBERSHIP_REQUIRED_ERROR);
  }
  return existingMembership;
};

/**
 * Checks if a user is the owner of a club.
 * @param club The club to check
 * @param userId ID of the user to check
 * @returns True if the user is the club owner
 */
export const isClubOwner = (club: Club, userId: Id<"users">): boolean => {
  return club.createdBy === userId;
};
