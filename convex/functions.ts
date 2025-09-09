import { entsTableFactory, scheduledDeleteFactory } from "convex-ents";
import {
  customAction,
  customCtx,
  customCtxAndArgs,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { zCustomMutation, zCustomQuery } from "convex-helpers/server/zod";
import { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { DataModel } from "./_generated/dataModel";
import {
  action as baseAction,
  internalAction as baseInternalAction,
  internalMutation as baseInternalMutation,
  internalQuery as baseInternalQuery,
  mutation as baseMutation,
  query as baseQuery,
} from "./_generated/server";
import { entDefinitions } from "./schema";
import { UserDetailsWithProfile } from "./service/users/schemas";
import { enforceAuthenticated } from "./service/utils/validators/auth";
import { MutationCtx } from "./types";

const createQueryEntCtx = (baseCtx: GenericQueryCtx<DataModel>) => {
  const { db, ...restCtx } = baseCtx;
  return {
    ...restCtx,
    table: entsTableFactory(baseCtx, entDefinitions),
    db: undefined,
    UNSAFE_DB: db,
  };
};

export const createMutationEntCtx = (baseCtx: GenericMutationCtx<DataModel>) => {
  const { db, ...restCtx } = baseCtx;
  return {
    ...restCtx,
    table: entsTableFactory(baseCtx, entDefinitions),
    db: undefined,
    UNSAFE_DB: db,
  };
};

const createActionEntCtx = () => ({});

export const query = customQuery(
  baseQuery,
  customCtx(async (ctx) => createQueryEntCtx(ctx)),
);

export const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx) => createMutationEntCtx(ctx)),
);

export const internalQuery = customQuery(
  baseInternalQuery,
  customCtx(async (ctx) => createQueryEntCtx(ctx)),
);

export const internalMutation = customMutation(
  baseInternalMutation,
  customCtx(async (ctx) => createMutationEntCtx(ctx)),
);

export const action = customAction(
  baseAction,
  customCtx(async (_) => createActionEntCtx()),
);

export const internalAction = customAction(
  baseInternalAction,
  customCtx(async (_) => createActionEntCtx()),
);

type AuthenticationOptions = {
  profileRequired?: boolean;
};

export interface AuthenticatedWithProfileCtx extends MutationCtx {
  currentUser: UserDetailsWithProfile;
}

/**
 * Creates a public query.
 * @returns Custom query function with enhanced database context
 */
export const publicQuery = () => {
  return zCustomQuery(
    baseQuery,
    customCtx(async (baseCtx) => createQueryEntCtx(baseCtx)),
  );
};

/**
 * Creates an authenticated query.
 * @param options Authentication options including profile requirement
 * @returns Custom query function with enhanced database context and authenticated context
 * @throws ConvexError when user is not authenticated or profile is required but missing
 */
export const authenticatedQuery = (options: AuthenticationOptions = {}) => {
  const { profileRequired = true } = options;

  return zCustomQuery(
    baseQuery,
    customCtxAndArgs({
      args: {},
      input: async (baseCtx) => {
        const ctx = createQueryEntCtx(baseCtx);
        const currentUser = await enforceAuthenticated(ctx, { profileRequired });
        return {
          args: {},
          ctx: {
            ...ctx,
            currentUser,
          } as AuthenticatedWithProfileCtx,
        };
      },
    }),
  );
};

/**
 * Creates an authenticated mutation.
 * @param options Authentication options including profile requirement
 * @returns Custom mutation function with enhanced database context and authenticated context
 * @throws ConvexError when user is not authenticated or profile is required but missing
 */
export const authenticatedMutation = (options: AuthenticationOptions = {}) => {
  const { profileRequired = true } = options;

  return zCustomMutation(
    baseMutation,
    customCtxAndArgs({
      args: {},
      input: async (baseCtx) => {
        const ctx = createMutationEntCtx(baseCtx);
        const currentUser = await enforceAuthenticated(ctx, { profileRequired });
        return {
          args: {},
          ctx: {
            ...ctx,
            currentUser,
          } as AuthenticatedWithProfileCtx,
        };
      },
    }),
  );
};

export const scheduledDelete = scheduledDeleteFactory(entDefinitions);
