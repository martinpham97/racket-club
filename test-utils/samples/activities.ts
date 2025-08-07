import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import schema from "@/convex/schema";
import { Activity, ResourceId } from "@/convex/service/activities/schemas";
import { TestConvex } from "convex-test";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestActivity = (
  resourceId?: Id<"clubs"> | Id<"users">,
  createdBy?: Id<"users">,
  overrides?: Partial<Activity>,
): Omit<Activity, "_id" | "_creationTime"> => ({
  resourceId: resourceId || genId<"clubs">("clubs"),
  type: ACTIVITY_TYPES.CLUB_CREATED,
  createdBy: createdBy || genId<"users">("users"),
  createdAt: Date.now(),
  ...overrides,
});

export const createTestActivityRecord = (
  resourceId?: Id<"clubs"> | Id<"users">,
  createdBy?: Id<"users">,
  overrides?: Partial<Activity>,
): Activity => ({
  _id: genId<"activities">("activities"),
  _creationTime: Date.now(),
  ...createTestActivity(resourceId, createdBy, overrides),
});

export class ActivityTestHelpers {
  constructor(private t: TestConvex<typeof schema>) {}

  async insertActivity(activity: WithoutSystemFields<Activity>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("activities", activity);
    });
  }

  async getActivitiesForResource(resourceId: ResourceId) {
    return await this.t.run(async (ctx) =>
      ctx.db
        .query("activities")
        .withIndex("resourceCreatedAt", (q) => q.eq("resourceId", resourceId))
        .order("desc")
        .collect(),
    );
  }

  async getActivity(activityId: Id<"activities">) {
    return await this.t.run(async (ctx) => ctx.db.get(activityId));
  }
}
