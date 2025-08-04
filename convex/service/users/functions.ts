import {
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { authenticatedMutationWithRLS, publicQueryWithRLS } from "@/convex/service/utils/functions";
import { enforceOwnershipOrAdmin } from "@/convex/service/utils/validators/auth";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { ConvexError } from "convex/values";
import {
  createUserProfile as dtoCreateUserProfile,
  getCurrentUser as dtoGetCurrentUser,
  getProfileByUserId as dtoGetProfileByUserId,
  updateUserProfile as dtoUpdateUserProfile,
} from "./database";
import { userProfileCreateSchema, userProfileUpdateSchema } from "./schemas";

/**
 * Gets the current authenticated user with their profile information.
 * @returns User details with profile if authenticated, null otherwise
 */
export const getCurrentUser = publicQueryWithRLS()({
  args: {},
  handler: async (ctx) => await dtoGetCurrentUser(ctx),
});

/**
 * Creates a new user profile for the authenticated user.
 * User can only create their own profile.
 * Admin can create profile for anyone.
 * @returns User Profile details
 * @throws ConvexError when profile already exists for the user
 */
export const createUserProfile = authenticatedMutationWithRLS({ profileRequired: false })({
  args: userProfileCreateSchema,
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    enforceOwnershipOrAdmin(currentUser, args.userId);
    const existingProfile = await dtoGetProfileByUserId(ctx, args.userId);
    if (existingProfile) {
      throw new ConvexError(USER_PROFILE_ALREADY_EXISTS_ERROR);
    }
    return await dtoCreateUserProfile(ctx, args);
  },
});

/**
 * Updates an existing user profile.
 * User can only update their own profile.
 * Admin can update anyone's profile.
 * @throws ConvexError when user profile doesn't exist, rate limit exceeded, or access denied
 */
export const updateUserProfile = authenticatedMutationWithRLS()({
  args: userProfileUpdateSchema,
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    await enforceRateLimit(ctx, "profileUpdate", currentUser._id);
    enforceOwnershipOrAdmin(currentUser, args.userId);
    const profile = await dtoGetProfileByUserId(ctx, args.userId);
    if (!profile) {
      throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
    }
    return await dtoUpdateUserProfile(ctx, profile._id, args);
  },
});
