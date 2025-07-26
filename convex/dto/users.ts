import { getAuthUserId } from "@convex-dev/auth/server";
import { getOneFrom } from "convex-helpers/server/relationships";
import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { UserProfileInput } from "../schemas/users";

export const findUserByEmail = async (ctx: QueryCtx, email?: string) => {
  if (!email) throw new Error("email is required");
  return await getOneFrom(ctx.db, "users", "email", email);
};

export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  const profile = await getProfileByUserId(ctx, userId);

  return { ...user, profile };
};

export const getProfileByUserId = async (ctx: QueryCtx, userId: Id<"users">) => {
  return await getOneFrom(ctx.db, "userProfiles", "userId", userId);
};

export const createUserProfile = async (ctx: MutationCtx, input: UserProfileInput) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Must be logged in to create a profile");

  const existingProfile = await getProfileByUserId(ctx, userId);
  if (existingProfile) throw new Error("Profile already exists");

  const profile = await ctx.db.insert("userProfiles", {
    ...input,
    userId,
    isAdmin: false,
  });
  return profile;
};
