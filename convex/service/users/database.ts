import { getAuthUserId } from "@convex-dev/auth/server";
import { getOneFrom } from "convex-helpers/server/relationships";
import { DocumentByName } from "convex/server";
import { ConvexError } from "convex/values";
import { DataModel, Id } from "../../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../../_generated/server";
import { USER_PROFILE_REQUIRED_ERROR } from "../../constants/errors";
import { UserProfileInput } from "./schemas";

type UserDoc = DocumentByName<DataModel, "users">;
type UserProfileDoc = DocumentByName<DataModel, "userProfiles"> | null;

export interface CurrentUser extends UserDoc {
  profile: UserProfileDoc;
}

export const findUserByEmail = async (ctx: QueryCtx, email: string): Promise<UserDoc | null> => {
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

export const getProfileByUserId = async (
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<UserProfileDoc | null> => {
  return await getOneFrom(ctx.db, "userProfiles", "userId", userId);
};

export const createUserProfile = async (
  ctx: MutationCtx,
  input: UserProfileInput,
): Promise<Id<"userProfiles">> => {
  const existingProfile = await getProfileByUserId(ctx, input.userId);

  if (existingProfile) {
    return existingProfile._id;
  }

  const profile = await ctx.db.insert("userProfiles", {
    ...input,
    isAdmin: false,
  });
  return profile;
};

export const updateUserProfile = async (
  ctx: MutationCtx,
  input: UserProfileInput,
): Promise<UserProfileDoc> => {
  const profile = await getProfileByUserId(ctx, input.userId);
  if (!profile) {
    throw new ConvexError(USER_PROFILE_REQUIRED_ERROR);
  }
  await ctx.db.patch(profile._id, {
    ...input,
  });
  return profile;
};
