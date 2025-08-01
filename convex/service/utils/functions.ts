import { mutation, query } from "@/convex/_generated/server";
import { customCtxAndArgs } from "convex-helpers/server/customFunctions";
import { wrapDatabaseReader, wrapDatabaseWriter } from "convex-helpers/server/rowLevelSecurity";
import { zCustomMutation, zCustomQuery } from "convex-helpers/server/zod";
import { rlsRules } from "./database";
import { enforceAuthenticated } from "./validators/auth";

type AuthenticationOptions = {
  profileRequired?: boolean;
};

export function publicQueryWithRLS() {
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
}

export function authenticatedQueryWithRLS(options: AuthenticationOptions = {}) {
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
          },
        };
      },
    }),
  );
}

export function authenticatedMutationWithRLS(options: AuthenticationOptions = {}) {
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
          },
        };
      },
    }),
  );
}
