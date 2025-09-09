import { DataModel } from "@/convex/_generated/dataModel";
import { activityTypes } from "@/convex/constants/activities";
import { defineEnt } from "convex-ents";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { DocumentByName } from "convex/server";
import z from "zod";

export const resourceIdSchema = z.union([
  zid("clubs"),
  zid("clubMemberships"),
  zid("users"),
  zid("userProfiles"),
  zid("events"),
  zid("eventSeries"),
  zid("eventParticipants"),
  zid("_scheduled_functions"),
]);

export type ResourceId = z.infer<typeof resourceIdSchema>;

export const activityMetadataSchema = z.array(
  z.object({
    previousValue: z.string().optional(),
    newValue: z.string().optional(),
    fieldChanged: z.string().optional(),
  }),
);
export const activitySchema = z.object({
  resourceId: resourceIdSchema,
  relatedId: resourceIdSchema.optional(),
  type: z.enum(activityTypes as [string, ...string[]]),
  createdBy: zid("users").optional(),
  createdAt: z.number(),
  scheduledAt: z.number().optional(),
  date: z.number(),
  metadata: activityMetadataSchema.optional(),
});

export const activityInputSchema = activitySchema.omit({
  createdAt: true,
  date: true,
});

export type Activity = DocumentByName<DataModel, "activities">;
export type ActivityMetadata = z.infer<typeof activityMetadataSchema>;
export type ActivityCreateInput = z.infer<typeof activityInputSchema>;

export const activityTable = defineEnt(zodToConvex(activitySchema))
  .index("resourceType", ["resourceId", "type"])
  .index("resourceDate", ["resourceId", "date"])
  .index("resourceTypeScheduledAt", ["resourceId", "type", "scheduledAt"])
  .index("relatedId", ["relatedId"]);

export const activityTables = {
  activities: activityTable,
};
