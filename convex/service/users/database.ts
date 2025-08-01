import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_PROVIDER_NO_EMAIL_ERROR,
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getOneFrom } from "convex-helpers/server/relationships";
import { ConvexError } from "convex/values";
import { CurrentUser, User, UserProfile, UserProfileInput, UserProfilePartial } from "./schemas";

export const findUserByEmail = async (ctx: QueryCtx, email: string): Promise<User | null> => {
  return await getOneFrom(ctx.db, "users", "email", email);
};

export const getCurrentUser = async (ctx: QueryCtx): Promise<CurrentUser | null> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  const profile = await getProfileByUserId(ctx, userId);
  return { ...user, profile };
};

export async function createOrUpdateUser(
  ctx: MutationCtx,
  args: {
    existingUserId?: Id<"users"> | null;
    email?: string;
  },
) {
  if (!!args.existingUserId) {
    return args.existingUserId;
  }

  if (!args.email) {
    throw new ConvexError(AUTH_PROVIDER_NO_EMAIL_ERROR);
  }

  const existingUser = await findUserByEmail(ctx, args.email);
  if (existingUser) return existingUser._id;

  return ctx.db.insert("users", {
    email: args.email,
  });
}

export const getProfileByUserId = async (
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<UserProfile | null> => {
  return await getOneFrom(ctx.db, "userProfiles", "userId", userId);
};

export const createUserProfile = async (
  ctx: MutationCtx,
  input: UserProfileInput,
): Promise<Id<"userProfiles">> => {
  const existingProfile = await getProfileByUserId(ctx, input.userId);
  if (existingProfile) {
    throw new ConvexError(USER_PROFILE_ALREADY_EXISTS_ERROR);
  }
  const profile = await ctx.db.insert("userProfiles", {
    ...input,
    isAdmin: false,
  });
  return profile;
};

export const updateUserProfile = async (
  ctx: MutationCtx,
  input: UserProfilePartial,
): Promise<UserProfile> => {
  const profile = await getProfileByUserId(ctx, input.userId);
  if (!profile) {
    throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
  }
  await ctx.db.patch(profile._id, {
    ...input,
  });
  return profile;
};
