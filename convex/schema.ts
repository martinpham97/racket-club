import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { activityTables } from "./service/activities/schemas";
import { clubTables } from "./service/clubs/schemas";
import { userTables } from "./service/users/schemas";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  ...userTables,
  ...clubTables,
  ...activityTables,
  numbers: defineTable({
    value: v.number(),
  }),
});
