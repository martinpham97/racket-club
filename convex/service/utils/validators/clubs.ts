import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_NOT_FOUND_ERROR,
  CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
} from "@/convex/constants/errors";
import { getClubMembershipForUser } from "@/convex/service/clubs/database";
import { Club, ClubMembership, ClubUpdateInput } from "@/convex/service/clubs/schemas";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { ConvexError } from "convex/values";
import { isOwnerOrSystemAdmin } from "./auth";

/**
 * Enforces that the current user has permission to modify the club.
 * User must be either the club creator, system admin, or approved club admin.
 * @param ctx - Authenticated context with profile
 * @param club - Club to check permissions for
 * @throws Error when user lacks permission to modify the club
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
  const membership = await ctx.db
    .query("clubMemberships")
    .withIndex("clubUser", (q) => q.eq("clubId", club._id).eq("userId", ctx.currentUser._id))
    .unique();

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
    const clubWithSameName = await ctx.db
      .query("clubs")
      .withIndex("publicName", (q) => q.eq("isPublic", true).eq("name", name))
      .first();
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
 * Validates that a membership exists and throws an error if not.
 * @param membership - The membership to validate
 * @returns The validated membership
 * @throws ConvexError when membership is null
 */
export const validateMembershipExists = (membership: ClubMembership | null): ClubMembership => {
  if (!membership) {
    throw new ConvexError(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
  }
  return membership;
};

/**
 * Validates that a club can be joined by checking capacity and approval status.
 * @param club - The club to validate
 * @throws ConvexError when club is full or public but unapproved
 */
export const validateClubJoinability = (club: Club) => {
  if (club.numMembers >= club.maxMembers) {
    throw new ConvexError(CLUB_FULL_ERROR);
  }
  if (club.isPublic && !club.isApproved) {
    throw new ConvexError(CLUB_PUBLIC_UNAPPROVED_ERROR);
  }
};

/**
 * Validates and returns memberships for bulk operations.
 * Ensures all memberships exist, belong to the same club, and user has permissions.
 * @param ctx - Authenticated context with profile
 * @param membershipIds - Array of membership IDs to validate
 * @returns Object containing validated memberships and club ID
 * @throws ConvexError when memberships are from different clubs or user lacks permissions
 */
export const validateBulkMemberships = async (
  ctx: AuthenticatedWithProfileCtx,
  membershipIds: Id<"clubMemberships">[],
): Promise<{ memberships: ClubMembership[]; clubId: Id<"clubs"> | null }> => {
  if (membershipIds.length === 0) return { memberships: [], clubId: null };

  const uniqueIds = [...new Set(membershipIds)];
  const memberships = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
  const validMemberships = memberships.filter(Boolean) as ClubMembership[];

  if (validMemberships.length === 0) return { memberships: [], clubId: null };

  const clubId = validMemberships[0].clubId;
  const allSameClub = validMemberships.every((m) => m.clubId === clubId);
  if (!allSameClub) {
    throw new ConvexError(CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR);
  }

  return { memberships: validMemberships, clubId };
};
