import { Id } from "@/convex/_generated/dataModel";
import { AUTH_PROVIDER_NO_EMAIL_ERROR } from "@/convex/constants/errors";
import { MutationCtx, QueryCtx } from "@/convex/types";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import {
  User,
  UserDetails,
  UserProfile,
  UserProfileCreateInput,
  UserProfileUpdateInput,
} from "./schemas";

/**
 * Finds a user by their email address.
 * @param ctx Query context
 * @param email User's email address
 * @returns User object if found, null otherwise
 */
export const findUserByEmail = async (ctx: QueryCtx, email: string): Promise<User | null> => {
  return await ctx.table("users").get("email", email);
};

/**
 * Gets the current authenticated user with their profile.
 * If the user has not created a profile, only user details are returned.
 * @param ctx Query context
 * @returns User details with profile if authenticated, null otherwise
 */
export const getCurrentUser = async (ctx: QueryCtx): Promise<UserDetails | null> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.table("users").get(userId);
  if (!user) return null;

  const profile = await user.edge("profile");
  return { ...user, profile };
};

/**
 * Gets an existing user or creates a new one if it doesn't exist.
 * This function is called by Convex Auth to link existing user.
 * See: https://labs.convex.dev/auth/advanced#controlling-user-creation-and-account-linking-behavior.
 * @param ctx Mutation context
 * @param args Arguments containing existing user ID or email
 * @param args.existingUserId Existing user ID if available
 * @param args.email Email address for user lookup/creation
 * @returns User ID
 * @throws ConvexError when no email is provided
 */
export const getOrCreateUser = async (
  ctx: MutationCtx,
  args: {
    existingUserId?: Id<"users"> | null;
    email?: string;
  },
) => {
  if (args.existingUserId) {
    return args.existingUserId;
  }

  if (!args.email) {
    throw new ConvexError(AUTH_PROVIDER_NO_EMAIL_ERROR);
  }

  const existingUser = await findUserByEmail(ctx, args.email);
  if (existingUser) {
    return existingUser._id;
  }

  return ctx.table("users").insert({
    email: args.email,
  });
};

/**
 * Gets a user profile by user ID.
 * @param ctx Query context
 * @param userId User ID to lookup profile for
 * @returns User profile if found, null otherwise
 */
export const getProfileByUserId = async (
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<UserProfile | null> => {
  return await ctx.table("userProfiles").get("userId", userId);
};

/**
 * Creates a non-admin new user profile.
 * @param ctx Mutation context
 * @param userId User ID to associate with the profile
 * @param input User profile creation data
 * @returns User profile
 */
export const createUserProfile = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  input: UserProfileCreateInput,
): Promise<UserProfile> => {
  return await ctx
    .table("userProfiles")
    .insert({
      ...input,
      userId,
      isAdmin: false,
    })
    .get();
};

/**
 * Updates an existing user profile.
 * @param ctx Mutation context
 * @param profileId Profile ID
 * @param input User profile update data
 * @returns Updated user profile
 */
export const updateUserProfile = async (
  ctx: MutationCtx,
  profileId: Id<"userProfiles">,
  input: UserProfileUpdateInput,
): Promise<UserProfile> => {
  return await ctx
    .table("userProfiles")
    .getX(profileId)
    .patch({
      ...input,
    })
    .get();
};
