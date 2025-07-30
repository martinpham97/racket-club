import { ConvexError } from "convex/values";
import { Id } from "../../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  AUTH_UNAUTHENTICATED_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "../../constants/errors";
import { CurrentUser, getCurrentUser } from "../../service/users/database";

export function enforceOwnershipOrAdmin(currentUser: CurrentUser, targetUserId: Id<"users">) {
  if (!currentUser.profile?.isAdmin && targetUserId !== currentUser._id) {
    throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
  }
}

export const enforceAuthenticated = async (
  ctx: QueryCtx | MutationCtx,
  options?: { profileRequired?: boolean },
) => {
  const userWithProfile = await getCurrentUser(ctx);
  if (!userWithProfile) {
    throw new ConvexError(AUTH_UNAUTHENTICATED_ERROR);
  }
  if (!userWithProfile.profile && options?.profileRequired) {
    throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
  }
  return userWithProfile;
};
