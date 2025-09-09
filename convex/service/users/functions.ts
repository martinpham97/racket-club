import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { authenticatedMutation, authenticatedQuery, publicQuery } from "@/convex/functions";
import {
  createActivity as dtoCreateActivity,
  listActivitiesForRelatedResource as dtoListActivityForUser,
} from "@/convex/service/activities/database";
import { activitySchema } from "@/convex/service/activities/schemas";
import { getMetadata } from "@/convex/service/utils/metadata";
import { paginatedResult } from "@/convex/service/utils/pagination";
import { enforceOwnershipOrAdmin } from "@/convex/service/utils/validators/auth";
import { validateDateOfBirth } from "@/convex/service/utils/validators/profile";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { convexToZod, withSystemFields, zid } from "convex-helpers/server/zod";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import z from "zod";
import {
  createUserProfile as dtoCreateUserProfile,
  getCurrentUser as dtoGetCurrentUser,
  getProfileByUserId as dtoGetProfileByUserId,
  updateUserProfile as dtoUpdateUserProfile,
} from "./database";
import {
  userDetailsSchema,
  userProfileCreateSchema,
  userProfileSchema,
  userProfileUpdateSchema,
} from "./schemas";

/**
 * Gets the current authenticated user with their profile information.
 * @returns User details with profile if authenticated, null otherwise
 */
export const getCurrentUser = publicQuery()({
  returns: userDetailsSchema.nullable(),
  handler: async (ctx) => await dtoGetCurrentUser(ctx),
});

/**
 * Lists activities for a user.
 * Users can only see their own activities.
 * @returns Paginated list of user activities
 */
export const listUserActivities = authenticatedQuery()({
  args: {
    userId: zid("users"),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("activities", activitySchema.shape))),
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
export const createUserProfile = authenticatedMutation({ profileRequired: false })({
  args: {
    input: userProfileCreateSchema,
  },
  returns: z.object(withSystemFields("userProfiles", userProfileSchema.shape)),
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    const { input } = args;
    enforceOwnershipOrAdmin(currentUser, input.userId);

    // Validate profile data
    if (input.dob) {
      validateDateOfBirth(input.dob);
    }

    const existingProfile = await dtoGetProfileByUserId(ctx, input.userId);
    if (existingProfile) {
      throw new ConvexError(USER_PROFILE_ALREADY_EXISTS_ERROR);
    }
    const profile = await dtoCreateUserProfile(ctx, input.userId, input);

    await dtoCreateActivity(ctx, {
      resourceId: profile._id,
      relatedId: currentUser._id,
      type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
    });

    return profile;
  },
});

/**
 * Updates an existing user profile.
 * User can only update their own profile.
 * Admin can update anyone's profile.
 * @throws ConvexError when user profile doesn't exist, rate limit exceeded, or access denied
 */
export const updateUserProfile = authenticatedMutation()({
  args: {
    input: userProfileUpdateSchema,
  },
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    const { input } = args;
    await enforceRateLimit(ctx, "profileUpdate", currentUser._id);
    enforceOwnershipOrAdmin(currentUser, input.userId);

    // Validate profile data
    if (input.dob) {
      validateDateOfBirth(input.dob);
    }

    const profile = await dtoGetProfileByUserId(ctx, input.userId);
    if (!profile) {
      throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
    }
    await dtoUpdateUserProfile(ctx, profile._id, input);

    await dtoCreateActivity(ctx, {
      resourceId: profile._id,
      relatedId: currentUser._id,
      type: ACTIVITY_TYPES.USER_PROFILE_UPDATED,
      metadata: getMetadata(profile, args),
    });
  },
});
