import { AUTH_ACCESS_DENIED_ERROR } from "@/convex/constants/errors";
import { getMyClubMembership } from "@/convex/service/clubs/database";
import { Club } from "@/convex/service/clubs/schemas";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { ConvexError } from "convex/values";
import { isOwnerOrSystemAdmin } from "./auth";

import { QueryCtx } from "@/convex/_generated/server";
import { CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR } from "@/convex/constants/errors";

/**
 * Enforces that the current user has permission to modify the club.
 * User must be either the club creator, system admin, or approved club admin.
 * @param ctx - Authenticated context with profile
 * @param club - Club to check permissions for
 * @throws Error when user lacks permission to modify the club
 */
export const enforceClubOwnershipOrAdmin = async (ctx: AuthenticatedWithProfileCtx, club: Club) => {
  if (!isOwnerOrSystemAdmin(ctx.currentUser, club.createdBy)) {
    const membership = await getMyClubMembership(ctx, club._id);
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
