import { GenericEnt, GenericEntWriter } from "convex-ents";
import { CustomCtx } from "convex-helpers/server/customFunctions";
import { TableNames } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./functions";
import { entDefinitions } from "./schema";

export type QueryCtx = CustomCtx<typeof query>;
export type MutationCtx = CustomCtx<typeof mutation>;
export type ActionCtx = CustomCtx<typeof action>;
export type InternalQueryCtx = CustomCtx<typeof internalQuery>;
export type InternalMutationCtx = CustomCtx<typeof internalMutation>;
export type InternalActionCtx = CustomCtx<typeof internalAction>;

export type Ent<TableName extends TableNames> = GenericEnt<typeof entDefinitions, TableName>;
export type EntWriter<TableName extends TableNames> = GenericEntWriter<
  typeof entDefinitions,
  TableName
>;
