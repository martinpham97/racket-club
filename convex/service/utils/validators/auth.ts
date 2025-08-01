import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  AUTH_UNAUTHENTICATED_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { getCurrentUser } from "@/convex/service/users/database";
import { CurrentUser } from "@/convex/service/users/schemas";
import { ConvexError } from "convex/values";

export function enforceOwnershipOrAdmin(currentUser: CurrentUser, targetUserId: Id<"users">) {
  if (targetUserId !== currentUser._id && !currentUser.profile?.isAdmin) {
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
