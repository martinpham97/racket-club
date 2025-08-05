import { DataModel } from "@/convex/_generated/dataModel";
import { mutation, MutationCtx, query } from "@/convex/_generated/server";
import { UserDetailsWithProfile } from "@/convex/service/users/schemas";
import { customCtxAndArgs } from "convex-helpers/server/customFunctions";
import { wrapDatabaseReader, wrapDatabaseWriter } from "convex-helpers/server/rowLevelSecurity";
import { zCustomMutation, zCustomQuery } from "convex-helpers/server/zod";
import { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import { rlsRules } from "./database";
import { enforceAuthenticated } from "./validators/auth";

type AuthenticationOptions = {
  profileRequired?: boolean;
};

export interface AuthenticatedWithProfileCtx extends MutationCtx {
  db: GenericDatabaseReader<DataModel> & GenericDatabaseWriter<DataModel>;
  currentUser: UserDetailsWithProfile;
}

/**
 * Creates a public query with row-level security (RLS) applied.
 * @returns Custom query function with RLS-wrapped database reader
 */
export const publicQueryWithRLS = () => {
  return zCustomQuery(
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
};

/**
 * Creates an authenticated query with row-level security (RLS) applied.
 * @param options Authentication options including profile requirement
 * @returns Custom query function with RLS-wrapped database reader and authenticated context
 * @throws ConvexError when user is not authenticated or profile is required but missing
 */
export const authenticatedQueryWithRLS = (options: AuthenticationOptions = {}) => {
  const { profileRequired = true } = options;

  return zCustomQuery(
    query,
    customCtxAndArgs({
      args: {},
      input: async (ctx) => {
        const currentUser = await enforceAuthenticated(ctx, { profileRequired });
        return {
          args: {},
          ctx: {
            db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx, currentUser)),
            currentUser,
          } as AuthenticatedWithProfileCtx,
        };
      },
    }),
  );
};

/**
 * Creates an authenticated mutation with row-level security (RLS) applied.
 * @param options Authentication options including profile requirement
 * @returns Custom mutation function with RLS-wrapped database writer and authenticated context
 * @throws ConvexError when user is not authenticated or profile is required but missing
 */
export const authenticatedMutationWithRLS = (options: AuthenticationOptions = {}) => {
  const { profileRequired = true } = options;

  return zCustomMutation(
    mutation,
    customCtxAndArgs({
      args: {},
      input: async (ctx) => {
        const currentUser = await enforceAuthenticated(ctx, { profileRequired });
        return {
          args: {},
          ctx: {
            db: wrapDatabaseWriter(ctx, ctx.db, await rlsRules(ctx, currentUser)),
            currentUser,
          } as AuthenticatedWithProfileCtx,
        };
      },
    }),
  );
};
