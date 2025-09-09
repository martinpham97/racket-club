import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import { Activity, ResourceId } from "@/convex/service/activities/schemas";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestActivity = (
  resourceId?: Id<"clubs"> | Id<"users">,
  overrides?: Partial<Activity>,
): Omit<Activity, "_id" | "_creationTime"> => ({
  resourceId: resourceId || genId<"clubs">("clubs"),
  type: ACTIVITY_TYPES.CLUB_CREATED,
  createdAt: Date.now(),
  date: Date.now(),
  ...overrides,
});

export const createTestActivityRecord = (
  resourceId?: Id<"clubs"> | Id<"users">,
  overrides?: Partial<Activity>,
): Activity => ({
  _id: genId<"activities">("activities"),
  _creationTime: Date.now(),
  ...createTestActivity(resourceId, overrides),
});

export class ActivityTestHelpers {
  constructor(private t: ReturnType<typeof import("@/convex/setup.testing").convexTest>) {}

  async getActivity(activityId: Id<"activities">) {
    return await this.t.runWithCtx((ctx) => ctx.table("activities").getX(activityId));
  }

  async insertActivity(activity: WithoutSystemFields<Activity>) {
    return await this.t.runWithCtx((ctx) => ctx.table("activities").insert(activity).get());
  }

  async getActivitiesForResource(resourceId: ResourceId) {
    return await this.t.runWithCtx((ctx) =>
      ctx
        .table("activities")
        .filter((q) => q.eq(q.field("resourceId"), resourceId))
        .order("desc"),
    );
  }

  async deleteActivity(activityId: Id<"activities">) {
    return await this.t.runWithCtx((ctx) => ctx.table("activities").getX(activityId).delete());
  }
}
