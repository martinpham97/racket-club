import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import {
  createActivity as dtoCreateActivity,
  listActivitiesForUser as dtoListActivityForUser,
} from "@/convex/service/activities/database";
import {
  authenticatedMutationWithRLS,
  authenticatedQueryWithRLS,
  publicQueryWithRLS,
} from "@/convex/service/utils/functions";
import { enforceOwnershipOrAdmin } from "@/convex/service/utils/validators/auth";
import { validateDateOfBirth } from "@/convex/service/utils/validators/profile";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { convexToZod, zid } from "convex-helpers/server/zod";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import { getMetadata } from "../utils/metadata";
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
 * Lists activities for a user.
 * Users can only see their own activities.
 * @returns Paginated list of user activities
 */
export const listUserActivities = authenticatedQueryWithRLS()({
  args: {
    userId: zid("users"),
    pagination: convexToZod(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    enforceOwnershipOrAdmin(ctx.currentUser, args.userId);
    return await dtoListActivityForUser(ctx, args.userId, args.pagination);
  },
});

/**
 * Creates a new user profile for the authenticated user.
 * User can only create their own profile.
 * Admin can create profile for anyone.
 * @returns User Profile ID
 * @throws ConvexError when profile already exists for the user
 */
export const createUserProfile = authenticatedMutationWithRLS({ profileRequired: false })({
  args: userProfileCreateSchema,
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    enforceOwnershipOrAdmin(currentUser, args.userId);

    // Validate profile data
    if (args.dob) {
      validateDateOfBirth(args.dob);
    }

    const existingProfile = await dtoGetProfileByUserId(ctx, args.userId);
    if (existingProfile) {
      throw new ConvexError(USER_PROFILE_ALREADY_EXISTS_ERROR);
    }
    const profileId = await dtoCreateUserProfile(ctx, args);

    await dtoCreateActivity(ctx, {
      resourceId: profileId,
      relatedId: currentUser._id,
      type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
      createdBy: ctx.currentUser._id,
      createdAt: Date.now(),
    });

    return profileId;
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

    // Validate profile data
    if (args.dob) {
      validateDateOfBirth(args.dob);
    }

    const profile = await dtoGetProfileByUserId(ctx, args.userId);
    if (!profile) {
      throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
    }
    await dtoUpdateUserProfile(ctx, profile._id, args);

    await dtoCreateActivity(ctx, {
      resourceId: profile._id,
      relatedId: currentUser._id,
      type: ACTIVITY_TYPES.USER_PROFILE_UPDATED,
      createdBy: ctx.currentUser._id,
      createdAt: Date.now(),
      metadata: getMetadata(profile, args),
    });
  },
});
