import { authenticatedMutationWithRLS, publicQueryWithRLS } from "../utils/functions";
import { enforceOwnershipOrAdmin } from "../utils/validators/auth";
import { enforceRateLimit } from "../utils/validators/rateLimit";
import {
  createUserProfile as dtoCreateUserProfile,
  getCurrentUser as dtoGetCurrentUser,
  updateUserProfile as dtoUpdateUserProfile,
} from "./database";
import { userProfileInputSchema } from "./schemas";

export const getCurrentUser = publicQueryWithRLS()({
  args: {},
  handler: async (ctx) => await dtoGetCurrentUser(ctx),
});

export const createUserProfile = authenticatedMutationWithRLS({ profileRequired: false })({
  args: userProfileInputSchema,
  handler: async (ctx, args) => {
    return await dtoCreateUserProfile(ctx, args);
  },
});

export const updateUserProfile = authenticatedMutationWithRLS()({
  args: userProfileInputSchema,
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    await enforceRateLimit(ctx, "profileUpdate", currentUser._id);
    enforceOwnershipOrAdmin(currentUser, args.userId);
    return await dtoUpdateUserProfile(ctx, args);
  },
});
