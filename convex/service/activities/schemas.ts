import { DataModel } from "@/convex/_generated/dataModel";
import { activityTypes } from "@/convex/constants/activities";
import { defineEnt } from "convex-ents";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { DocumentByName } from "convex/server";
import z from "zod";

export const activityMetadataSchema = z.array(
  z.object({
    previousValue: z.string().optional(),
    newValue: z.string().optional(),
    fieldChanged: z.string().optional(),
  }),
);

export const activitySchema = z.object({
  userId: zid("users").optional(),
  clubId: zid("clubs").optional(),
  eventId: zid("events").optional(),
  eventSeriesId: zid("eventSeries").optional(),
  type: z.enum(activityTypes as [string, ...string[]]),
  createdAt: z.number(),
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
  .edge("user", { to: "users", field: "userId", optional: true })
  .edge("club", { to: "clubs", field: "clubId", optional: true })
  .edge("event", { to: "events", field: "eventId", optional: true })
  .edge("eventSeries", { to: "eventSeries", field: "eventSeriesId", optional: true })
  .index("userType", ["userId", "type"])
  .index("userDate", ["userId", "date"])
  .index("clubType", ["clubId", "type"])
  .index("clubDate", ["clubId", "date"])
  .index("eventType", ["eventId", "type"])
  .index("eventDate", ["eventId", "date"])
  .index("eventSeriesType", ["eventSeriesId", "type"])
  .index("eventSeriesDate", ["eventSeriesId", "date"]);

export const activityTables = {
  activities: activityTable,
};
