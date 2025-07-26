import { getAuthUserId } from "@convex-dev/auth/server";
import { customCtxAndArgs } from "convex-helpers/server/customFunctions";
import {
  Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from "convex-helpers/server/rowLevelSecurity";
import { zCustomMutation, zCustomQuery } from "convex-helpers/server/zod";
import { DataModel } from "../_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "../_generated/server";
import { getCurrentUser, getProfileByUserId } from "../dto/users";

async function rlsRules(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  return {
    users: {
      read: async (_, user) => {
        // Unauthenticated users cannot view users
        if (!userId) {
          return false;
        }
        return true;
      },
      insert: async (_, user) => {
        return true;
      },
      modify: async (ctx, user) => {
        if (!userId) {
          throw new Error("Must be authenticated to modify a user");
        }
        const currentUserProfile = await getProfileByUserId(ctx, user._id);
        return !!currentUserProfile?.isAdmin;
      },
    },
    userProfiles: {
      read: async (_, userProfile) => {
        // Unauthenticated users cannot view profiles
        if (!userId) {
          return false;
        }
        return true;
      },
      insert: async (_, userProfile) => {
        return userProfile.userId === userId;
      },
      modify: async (ctx, userProfile) => {
        if (!userId) {
          throw new Error("Must be authenticated to modify a profile");
        }
        return userProfile.userId === userId || !!userProfile?.isAdmin;
      },
    },
  } satisfies Rules<QueryCtx, DataModel>;
}

export const publicQueryWithRLS = zCustomQuery(
  query,
  customCtxAndArgs({
    args: {},
    input: async (ctx) => ({
      args: {},
      ctx: {
        db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)),
      },
    }),
  }),
);

export const authenticatedQueryWithRLS = zCustomQuery(
  query,
  customCtxAndArgs({
    args: {},
    input: async (ctx) => {
      validateAuthenticatedWithProfile(ctx);
      return {
        args: {},
        ctx: { db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx)) },
      };
    },
  }),
);

export const authenticatedMutationWithRLS = zCustomMutation(
  mutation,
  customCtxAndArgs({
    args: {},
    input: async (ctx) => {
      validateAuthenticatedWithProfile(ctx);
      return {
        args: {},
        ctx: { db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)) },
      };
    },
  }),
);

export const authenticatedMutationWithoutProfileWithRLS = zCustomMutation(
  mutation,
  customCtxAndArgs({
    args: {},
    input: async (ctx) => {
      const user = await getAuthUserId(ctx);
      if (!user) throw new Error("Authentication required");
      return {
        args: {},
        ctx: { db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx)) },
      };
    },
  }),
);

const validateAuthenticatedWithProfile = async (ctx: QueryCtx | MutationCtx) => {
  const userWithProfile = await getCurrentUser(ctx);
  if (!userWithProfile) throw new Error("Authentication required");
  if (!userWithProfile.profile) throw new Error("Profile initialization required");
};
