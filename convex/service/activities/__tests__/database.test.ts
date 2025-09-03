import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import schema from "@/convex/schema";
import {
  createActivity,
  deleteActivitiesForResource,
  getActivity,
  getScheduledActivityForResource,
  listActivitiesForRelatedResource,
  listActivitiesForResource,
} from "@/convex/service/activities/database";
import { ActivityTestHelpers, createTestActivity } from "@/test-utils/samples/activities";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

describe("Activity Database Service", () => {
  const t = convexTest(schema);
  const activityHelpers = new ActivityTestHelpers(t);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  describe("getActivity", () => {
    it("returns activity when found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const activity = createTestActivity(clubId, userId);
      const activityId = await activityHelpers.insertActivity(activity);

      const result = await t.run(async (ctx) => {
        return await getActivity(ctx, activityId);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(activityId);
    });

    it("returns null when not found", async () => {
      const result = await t.run(async (ctx) => {
        return await getActivity(ctx, "invalid-id" as Id<"activities">);
      });

      expect(result).toBeNull();
    });
  });

  describe("listActivitiesForResource", () => {
    it("returns paginated activities for club", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      const activity1 = createTestActivity(clubId, userId, { type: ACTIVITY_TYPES.CLUB_CREATED });
      const activity2 = createTestActivity(clubId, userId, { type: ACTIVITY_TYPES.CLUB_UPDATED });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.run(async (ctx) => {
        return await listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.resourceId === clubId)).toBe(true);
    });
  });

  describe("createActivity", () => {
    it("inserts new activity", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const activity = createTestActivity(clubId, userId);

      const activityId = await t.run(async (ctx) => {
        return await createActivity(ctx, activity);
      });

      const savedActivity = await activityHelpers.getActivity(activityId);
      expect(savedActivity).not.toBeNull();
      expect(savedActivity!.resourceId).toBe(clubId);
      expect(savedActivity!.createdBy).toBe(userId);
      expect(savedActivity!.createdAt).toBeDefined();
      expect(savedActivity!.date).toEqual(savedActivity!.createdAt);
    });
  });

  it("auto populates date with scheduled time when creating a new scheduled activity", async () => {
    const userId = await userHelpers.insertUser();
    const clubId = await clubHelpers.insertClub(createTestClub(userId));
    const activity = createTestActivity(clubId, userId, { scheduledAt: Date.now() + 3000 });

    const activityId = await t.run(async (ctx) => {
      return await createActivity(ctx, activity);
    });

    const savedActivity = await activityHelpers.getActivity(activityId);
    expect(savedActivity).not.toBeNull();
    expect(savedActivity!.resourceId).toBe(clubId);
    expect(savedActivity!.createdBy).toBe(userId);
    expect(savedActivity!.createdAt).toBeDefined();
    expect(savedActivity!.date).toEqual(activity.scheduledAt);
  });

  describe("listActivitiesForRelatedResource", () => {
    it("returns paginated activities for user", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      const activity1 = createTestActivity(clubId, userId, { relatedId: userId });
      const activity2 = createTestActivity(clubId, userId, { relatedId: userId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.run(async (ctx) => {
        return await listActivitiesForRelatedResource(ctx, userId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.relatedId === userId)).toBe(true);
    });

    it("orders activities by descending date", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      const activity1 = createTestActivity(clubId, userId, {
        relatedId: userId,
        createdAt: 1000,
      });
      const activity2 = createTestActivity(clubId, userId, {
        relatedId: userId,
        createdAt: 2000,
      });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.run(async (ctx) => {
        return await listActivitiesForRelatedResource(ctx, userId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(2);
      expect(result.page[0].createdAt).toBeGreaterThan(result.page[1].createdAt);
    });
  });

  describe("deleteActivitiesForResource", () => {
    it("removes all activities for resource", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      const activity1 = createTestActivity(clubId, userId);
      const activity2 = createTestActivity(clubId, userId);

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      await t.run(async (ctx) => {
        await deleteActivitiesForResource(ctx, clubId);
      });

      const remainingActivities = await t.run(async (ctx) => {
        return await listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 });
      });

      expect(remainingActivities.page).toHaveLength(0);
    });
  });

  describe("listScheduledActivityForResource", () => {
    it("returns scheduled activity for resource at specific time and type", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, userId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });

      await activityHelpers.insertActivity(activity);

      const result = await t.run(async (ctx) => {
        return await getScheduledActivityForResource(
          ctx,
          clubId,
          scheduledTime,
          ACTIVITY_TYPES.CLUB_UPDATED,
        );
      });

      expect(result).not.toBeNull();
      expect(result!.scheduledAt).toBe(scheduledTime);
      expect(result!.type).toBe(ACTIVITY_TYPES.CLUB_UPDATED);
    });

    it("returns null when no matching activity found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const scheduledTime = Date.now() + 60000;

      const result = await t.run(async (ctx) => {
        return await getScheduledActivityForResource(
          ctx,
          clubId,
          scheduledTime,
          ACTIVITY_TYPES.CLUB_UPDATED,
        );
      });

      expect(result).toBeNull();
    });

    it("returns null when type doesn't match", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, userId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_CREATED,
      });

      await activityHelpers.insertActivity(activity);

      const result = await t.run(async (ctx) => {
        return await getScheduledActivityForResource(
          ctx,
          clubId,
          scheduledTime,
          ACTIVITY_TYPES.CLUB_UPDATED, // Different type
        );
      });

      expect(result).toBeNull();
    });

    it("only returns activity for specified resource", async () => {
      const userId = await userHelpers.insertUser();
      const clubId1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId2 = await clubHelpers.insertClub(createTestClub(userId, { name: "Club 2" }));
      const scheduledTime = Date.now() + 60000;

      const activity1 = createTestActivity(clubId1, userId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });
      const activity2 = createTestActivity(clubId2, userId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.run(async (ctx) => {
        return await getScheduledActivityForResource(
          ctx,
          clubId1,
          scheduledTime,
          ACTIVITY_TYPES.CLUB_UPDATED,
        );
      });

      expect(result).not.toBeNull();
      expect(result!.resourceId).toBe(clubId1);
    });
  });
});
