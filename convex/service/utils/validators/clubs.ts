import { AUTH_ACCESS_DENIED_ERROR } from "@/convex/constants/errors";
import { getMyClubMembership } from "../../clubs/database";
import { Club } from "../../clubs/schemas";
import { AuthenticatedWithProfileCtx } from "../functions";
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
    const membership = await getMyClubMembership(ctx, club._id);
    if (!membership?.isApproved || !membership?.isClubAdmin) {
      throw new Error(AUTH_ACCESS_DENIED_ERROR);
    }
  }
};
