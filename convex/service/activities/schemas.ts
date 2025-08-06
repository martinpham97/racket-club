import { DataModel } from "@/convex/_generated/dataModel";
import { activityTypes } from "@/convex/constants/activities";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable, DocumentByName } from "convex/server";
import z from "zod";

export const resourceIdSchema = z.union([zid("clubs"), zid("clubMemberships"), zid("users")]);

export const activitySchema = z.object({
  resourceId: resourceIdSchema,
  relatedIds: z.array(resourceIdSchema).optional(),
  type: z.enum(activityTypes as [string, ...string[]]),
  createdBy: zid("users"),
  createdAt: z.number(),
  metadata: z
    .array(
      z.object({
        previousValue: z.string().optional(),
        newValue: z.string().optional(),
        fieldChanged: z.string().optional(),
      }),
    )
    .optional(),
});

export type Activity = DocumentByName<DataModel, "activities">;

export const activityTable = defineTable(zodToConvex(activitySchema))
  .index("resourceType", ["resourceId", "type"])
  .index("resourceCreatedAt", ["resourceId", "createdAt"])
  .index("createdBy", ["createdBy"]);

export const activityTables = {
  activities: activityTable,
};
