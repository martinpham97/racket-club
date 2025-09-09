import { EntDefinition } from "convex-ents";
import { convexTest as baseConvexTest } from "convex-test";
import { SchemaDefinition, StorageActionWriter } from "convex/server";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { createMutationEntCtx } from "./functions";
import { MutationCtx as CustomMutationCtx } from "./types";

// Work around a TypeScript subtyping issue with Ents schemas
type GenericEntSchema = Record<string, EntDefinition>;
export const convexTest = <Schema extends GenericEntSchema>(
  schema: SchemaDefinition<Schema, boolean>,
) => {
  const baseT = baseConvexTest(schema);
  return {
    ...baseT,
    runWithCtx: createRunWithCtx(baseT),
    runAsUser: (userId: Id<"users">) => createRunWithCtx(baseT.withIdentity({ subject: userId })),
  };
};

// // Use inside t.run() to use Ents
// export const runCtx = async (ctx: MutationCtx & { storage: StorageActionWriter }) => {
//   const { db, ...restCtx } = ctx;
//   return {
//     ...restCtx,
//     table: entsTableFactory(ctx, entDefinitions),
//     db: undefined,
//     UNSAFE_DB: db,
//   };
// };

// Helper to create runWithCtx for a test instance
export const createRunWithCtx = (t: {
  run: <T>(fn: (ctx: MutationCtx & { storage: StorageActionWriter }) => Promise<T>) => Promise<T>;
}) => {
  return async <T>(fn: (ctx: CustomMutationCtx) => Promise<T>): Promise<T> => {
    return await t.run(async (baseCtx: MutationCtx & { storage: StorageActionWriter }) => {
      const ctx = await createMutationEntCtx(baseCtx);
      return await fn(ctx);
    });
  };
};
