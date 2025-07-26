import {
  createUserProfile as dtoCreateUserProfile,
  getCurrentUser as dtoGetCurrentUser,
} from "../dto/users";
import { userProfileInputSchema } from "../schemas/users";
import { authenticatedMutationWithoutProfileWithRLS, publicQueryWithRLS } from "../utils/database";

export const getCurrentUser = publicQueryWithRLS({
  args: {},
  handler: async (ctx, _) => await dtoGetCurrentUser(ctx),
});

export const createUserProfile = authenticatedMutationWithoutProfileWithRLS({
  args: userProfileInputSchema,
  handler: async (ctx, args) => {
    return await dtoCreateUserProfile(ctx, args);
  },
});
