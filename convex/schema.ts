import { authTables } from "@convex-dev/auth/server";
import { defineEnt, defineEntSchema, defineEntsFromTables, getEntDefinitions } from "convex-ents";
import { v } from "convex/values";
import { activityTables } from "./service/activities/schemas";
import { clubTables } from "./service/clubs/schemas";
import { eventTables } from "./service/events/schemas";
import { userTables } from "./service/users/schemas";

const schema = defineEntSchema({
  ...defineEntsFromTables(authTables),
  ...userTables,
  ...clubTables,
  ...activityTables,
  ...eventTables,
  numbers: defineEnt({
    value: v.number(),
  }),
});

export default schema;

export const entDefinitions = getEntDefinitions(schema);
