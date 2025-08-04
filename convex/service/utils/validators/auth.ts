import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  AUTH_UNAUTHENTICATED_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { getCurrentUser } from "@/convex/service/users/database";
import { UserDetails } from "@/convex/service/users/schemas";
import { ConvexError } from "convex/values";

/**
 * Checks if the current user is either the owner of the resource or an admin.
 * @param currentUser Current authenticated user with profile details
 * @param targetUserId User ID of the resource being accessed
 * @returns True if user is owner or admin, false otherwise
 */
export const isOwnerOrSystemAdmin = (currentUser: UserDetails, targetUserId: Id<"users">) => {
  return targetUserId === currentUser._id || !!currentUser.profile?.isAdmin;
};

/**
 * Enforces that the current user is either the owner of the resource or an admin.
 * @param currentUser Current authenticated user with profile details
 * @param targetUserId User ID of the resource being accessed
 * @throws ConvexError when user is neither the owner nor an admin
 */
export const enforceOwnershipOrAdmin = (currentUser: UserDetails, targetUserId: Id<"users">) => {
  if (!isOwnerOrSystemAdmin(currentUser, targetUserId)) {
    throw new ConvexError(AUTH_ACCESS_DENIED_ERROR);
  }
};

/**
 * Enforces that the current request is from an authenticated user.
 * If the request requires the user to have a profile, `options.profileRequired` should be set to `true`.
 * @param ctx Query Context
 * @param options Authentication options
 * @param options.profileRequired Enforce user profile is created or not. Default: `false`.
 * @returns User details (with optional profile details)
 */
export const enforceAuthenticated = async (ctx: QueryCtx, options?: { profileRequired?: boolean }) => {
  const userWithProfile = await getCurrentUser(ctx);
  if (!userWithProfile) {
    throw new ConvexError(AUTH_UNAUTHENTICATED_ERROR);
  }
  if (!userWithProfile.profile && options?.profileRequired) {
    throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
  }
  return userWithProfile;
};
