import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import { Activity } from "@/convex/service/activities/schemas";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

type ActivityInput = {
  userId?: Id<"users">;
  clubId?: Id<"clubs">;
  eventId?: Id<"events">;
  eventSeriesId?: Id<"eventSeries">;
  type?: string;
  scheduledAt?: number;
  metadata?: Array<{
    previousValue?: string;
    newValue?: string;
    fieldChanged?: string;
  }>;
};

export const createTestActivity = (
  input: ActivityInput = {},
): Omit<Activity, "_id" | "_creationTime"> => ({
  userId: input.userId,
  clubId: input.clubId,
  eventId: input.eventId,
  eventSeriesId: input.eventSeriesId,
  type: input.type || ACTIVITY_TYPES.CLUB_CREATED,
  createdAt: Date.now(),
  date: input.scheduledAt || Date.now(),
  metadata: input.metadata,
});

export const createTestActivityRecord = (input: ActivityInput = {}): Activity => ({
  _id: genId<"activities">("activities"),
  _creationTime: Date.now(),
  ...createTestActivity(input),
});

export class ActivityTestHelpers {
  constructor(private t: ReturnType<typeof import("@/convex/setup.testing").convexTest>) {}

  async getActivity(activityId: Id<"activities">) {
    return await this.t.runWithCtx((ctx) => ctx.table("activities").getX(activityId));
  }

  async insertActivity(activity: WithoutSystemFields<Activity>) {
    return await this.t.runWithCtx((ctx) => ctx.table("activities").insert(activity).get());
  }

  async getActivitiesForClub(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("activities", "clubDate", (q) => q.eq("clubId", clubId)).order("desc"),
    );
  }

  async listActivitiesForClub(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("activities", "clubDate", (q) => q.eq("clubId", clubId)).order("desc"),
    );
  }

  async getActivitiesForUser(userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("activities", "userDate", (q) => q.eq("userId", userId)).order("desc"),
    );
  }

  async listActivitiesForUser(userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("activities", "userDate", (q) => q.eq("userId", userId)).order("desc"),
    );
  }

  async getActivitiesForEventSeries(eventSeriesId: Id<"eventSeries">) {
    return await this.t.runWithCtx((ctx) =>
      ctx
        .table("activities", "eventSeriesDate", (q) => q.eq("eventSeriesId", eventSeriesId))
        .order("desc"),
    );
  }

  async listActivitiesForEventSeries(eventSeriesId: Id<"eventSeries">) {
    return await this.t.runWithCtx((ctx) =>
      ctx
        .table("activities", "eventSeriesDate", (q) => q.eq("eventSeriesId", eventSeriesId))
        .order("desc"),
    );
  }

  async getActivitiesForEvents(eventId: Id<"events">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("activities", "eventDate", (q) => q.eq("eventId", eventId)).order("desc"),
    );
  }

  async listActivitiesForEvent(eventId: Id<"events">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("activities", "eventDate", (q) => q.eq("eventId", eventId)).order("desc"),
    );
  }

  async deleteActivity(activityId: Id<"activities">) {
    return await this.t.runWithCtx((ctx) => ctx.table("activities").getX(activityId).delete());
  }
}
