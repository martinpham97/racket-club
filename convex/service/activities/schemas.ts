import { DataModel } from "@/convex/_generated/dataModel";
import { activityTypes } from "@/convex/constants/activities";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable, DocumentByName } from "convex/server";
import z from "zod";

export const activitySchema = z.object({
  resourceId: zid("clubs").or(zid("users")),
  title: z.string().max(200, "Title must be less than 200 characters long."),
  description: z.string().max(1000, "Description must be less than 1000 characters long."),
  type: z.enum(activityTypes as [string, ...string[]]),
  createdBy: zid("users"),
  createdAt: z.number(),
});

export type Activity = DocumentByName<DataModel, "activities">;

export const activityTable = defineTable(zodToConvex(activitySchema))
  .index("resourceId", ["resourceId"])
  .index("resourceCreatedAt", ["resourceId", "createdAt"]);

export const activityTables = {
  activities: activityTable,
};
