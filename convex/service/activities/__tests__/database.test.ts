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
import { convexTest } from "@/convex/setup.testing";
import { ActivityTestHelpers, createTestActivity } from "@/test-utils/samples/activities";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

describe("Activity Database Service", () => {
  let t: ReturnType<typeof convexTest>;
  let activityHelpers: ActivityTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let userHelpers: UserTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    activityHelpers = new ActivityTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    userHelpers = new UserTestHelpers(t);
  });

  describe("getActivity", () => {
    it("returns activity when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const activity = createTestActivity(clubId);
      const insertedActivity = await activityHelpers.insertActivity(activity);
      const activityId = insertedActivity._id;

      const result = await t.runWithCtx((ctx) => getActivity(ctx, activityId));

      expect(result).not.toBeNull();
      expect(result!._id).toBe(activityId);
    });

    it("returns null after activity is deleted", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const activity = createTestActivity(clubId);
      const insertedActivity = await activityHelpers.insertActivity(activity);
      const activityId = insertedActivity._id;

      await activityHelpers.deleteActivity(activityId);
      const result = await t.runWithCtx((ctx) => getActivity(ctx, activityId));

      expect(result).toBeNull();
    });

    it("returns correct activity properties", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const activity = createTestActivity(clubId, {
        type: ACTIVITY_TYPES.CLUB_CREATED,
        relatedId: userId,
      });
      const insertedActivity = await activityHelpers.insertActivity(activity);
      const activityId = insertedActivity._id;

      const result = await t.runWithCtx((ctx) => getActivity(ctx, activityId));

      expect(result).not.toBeNull();
      expect(result!._id).toBe(activityId);
      expect(result!.type).toBe(ACTIVITY_TYPES.CLUB_CREATED);
      expect(result!.relatedId).toBe(userId);
      expect(result!.resourceId).toBe(clubId);
    });
  });

  describe("listActivitiesForResource", () => {
    it("returns paginated activities for club", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity(clubId, { type: ACTIVITY_TYPES.CLUB_CREATED });
      const activity2 = createTestActivity(clubId, { type: ACTIVITY_TYPES.CLUB_UPDATED });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.resourceId === clubId)).toBe(true);
    });

    it("returns empty page when no activities exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("orders activities by descending date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity(clubId, { createdAt: 1000 });
      const activity2 = createTestActivity(clubId, { createdAt: 2000 });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].createdAt).toBeGreaterThan(result.page[1].createdAt);
    });
  });

  describe("createActivity", () => {
    it("inserts new activity", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const activity = createTestActivity(clubId);

      const createdActivity = await t.runWithCtx((ctx) => createActivity(ctx, activity));
      const activityId = createdActivity._id;

      const savedActivity = await activityHelpers.getActivity(activityId);
      expect(savedActivity).not.toBeNull();
      expect(savedActivity!.resourceId).toBe(clubId);
      expect(savedActivity!.createdAt).toBeDefined();
      expect(savedActivity!.date).toEqual(savedActivity!.createdAt);
    });

    it("creates activity with all optional fields", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, {
        relatedId: userId,
        scheduledAt: scheduledTime,
        metadata: [{ previousValue: "old", newValue: "new", fieldChanged: "name" }],
      });

      const createdActivity = await t.runWithCtx((ctx) => createActivity(ctx, activity));
      const savedActivity = await activityHelpers.getActivity(createdActivity._id);

      expect(savedActivity!.relatedId).toBe(userId);
      expect(savedActivity!.scheduledAt).toBe(scheduledTime);
      expect(savedActivity!.metadata).toEqual([
        { previousValue: "old", newValue: "new", fieldChanged: "name" },
      ]);
    });
  });

  it("auto populates date with scheduled time when creating a new scheduled activity", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const activity = createTestActivity(clubId, { scheduledAt: Date.now() + 3000 });

    const createdActivity = await t.runWithCtx((ctx) => createActivity(ctx, activity));
    const activityId = createdActivity._id;

    const savedActivity = await activityHelpers.getActivity(activityId);
    expect(savedActivity).not.toBeNull();
    expect(savedActivity!.resourceId).toBe(clubId);
    expect(savedActivity!.createdAt).toBeDefined();
    expect(savedActivity!.date).toEqual(activity.scheduledAt);
  });

  it("uses createdAt as date when scheduledAt is not provided", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const activity = createTestActivity(clubId); // No scheduledAt

    const createdActivity = await t.runWithCtx((ctx) => createActivity(ctx, activity));
    const savedActivity = await activityHelpers.getActivity(createdActivity._id);

    expect(savedActivity!.date).toEqual(savedActivity!.createdAt);
    expect(savedActivity!.scheduledAt).toBeUndefined();
  });

  describe("listActivitiesForRelatedResource", () => {
    it("returns paginated activities for user", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity(clubId, { relatedId: userId });
      const activity2 = createTestActivity(clubId, { relatedId: userId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForRelatedResource(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.relatedId === userId)).toBe(true);
    });

    it("orders activities by descending date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity(clubId, {
        relatedId: userId,
        createdAt: 1000,
      });
      const activity2 = createTestActivity(clubId, {
        relatedId: userId,
        createdAt: 2000,
      });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForRelatedResource(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].createdAt).toBeGreaterThan(result.page[1].createdAt);
    });
  });

  describe("deleteActivitiesForResource", () => {
    it("removes all activities for resource", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity(clubId);
      const activity2 = createTestActivity(clubId);

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      await t.runWithCtx((ctx) => deleteActivitiesForResource(ctx, clubId));

      const remainingActivities = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(remainingActivities.page).toHaveLength(0);
    });

    it("handles deletion when no activities exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await expect(
        t.runWithCtx((ctx) => deleteActivitiesForResource(ctx, clubId)),
      ).resolves.not.toThrow();
    });

    it("only deletes activities for specified resource", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId1 = club1._id;
      const club2 = await clubHelpers.insertClub(createTestClub(userId, { name: "Club 2" }));
      const clubId2 = club2._id;

      const activity1 = createTestActivity(clubId1);
      const activity2 = createTestActivity(clubId2);

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      await t.runWithCtx((ctx) => deleteActivitiesForResource(ctx, clubId1));

      const club1Activities = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId1, { cursor: null, numItems: 10 }),
      );
      const club2Activities = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId2, { cursor: null, numItems: 10 }),
      );

      expect(club1Activities.page).toHaveLength(0);
      expect(club2Activities.page).toHaveLength(1);
    });
  });

  describe("listScheduledActivityForResource", () => {
    it("returns scheduled activity for resource at specific time and type", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });

      await activityHelpers.insertActivity(activity);

      const result = await t.runWithCtx((ctx) =>
        getScheduledActivityForResource(ctx, clubId, scheduledTime, ACTIVITY_TYPES.CLUB_UPDATED),
      );

      expect(result).not.toBeNull();
      expect(result!.scheduledAt).toBe(scheduledTime);
      expect(result!.type).toBe(ACTIVITY_TYPES.CLUB_UPDATED);
    });

    it("returns null when no matching activity found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const scheduledTime = Date.now() + 60000;

      const result = await t.runWithCtx((ctx) =>
        getScheduledActivityForResource(ctx, clubId, scheduledTime, ACTIVITY_TYPES.CLUB_UPDATED),
      );

      expect(result).toBeNull();
    });

    it("returns null when type doesn't match", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_CREATED,
      });

      await activityHelpers.insertActivity(activity);

      const result = await t.runWithCtx((ctx) =>
        getScheduledActivityForResource(
          ctx,
          clubId,
          scheduledTime,
          ACTIVITY_TYPES.CLUB_UPDATED, // Different type
        ),
      );

      expect(result).toBeNull();
    });

    it("returns null when scheduledAt doesn't match", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });

      await activityHelpers.insertActivity(activity);

      const result = await t.runWithCtx((ctx) =>
        getScheduledActivityForResource(
          ctx,
          clubId,
          scheduledTime + 1000, // Different time
          ACTIVITY_TYPES.CLUB_UPDATED,
        ),
      );

      expect(result).toBeNull();
    });

    it("only returns activity for specified resource", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId1 = club1._id;
      const club2 = await clubHelpers.insertClub(createTestClub(userId, { name: "Club 2" }));
      const clubId2 = club2._id;
      const scheduledTime = Date.now() + 60000;

      const activity1 = createTestActivity(clubId1, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });
      const activity2 = createTestActivity(clubId2, {
        scheduledAt: scheduledTime,
        type: ACTIVITY_TYPES.CLUB_UPDATED,
      });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        getScheduledActivityForResource(ctx, clubId1, scheduledTime, ACTIVITY_TYPES.CLUB_UPDATED),
      );

      expect(result).not.toBeNull();
      expect(result!.resourceId).toBe(clubId1);
    });

    it("returns null when activity has no scheduledAt", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const scheduledTime = Date.now() + 60000;

      const activity = createTestActivity(clubId, {
        type: ACTIVITY_TYPES.CLUB_UPDATED,
        // No scheduledAt field
      });

      await activityHelpers.insertActivity(activity);

      const result = await t.runWithCtx((ctx) =>
        getScheduledActivityForResource(ctx, clubId, scheduledTime, ACTIVITY_TYPES.CLUB_UPDATED),
      );

      expect(result).toBeNull();
    });
  });

  describe("edge cases and error handling", () => {
    it("handles activities with same timestamp in correct order", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const sameTime = Date.now();

      const activity1 = createTestActivity(clubId, { createdAt: sameTime });
      const activity2 = createTestActivity(clubId, { createdAt: sameTime });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].createdAt).toBe(sameTime);
      expect(result.page[1].createdAt).toBe(sameTime);
    });

    it("handles pagination with numItems limit", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      for (let i = 0; i < 3; i++) {
        await activityHelpers.insertActivity(createTestActivity(clubId));
      }

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForResource(ctx, clubId, { cursor: null, numItems: 2 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.isDone).toBe(false);
    });

    it("filters activities correctly for different related resources", async () => {
      const user1 = await userHelpers.insertUser();
      const user2 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const activity1 = createTestActivity(clubId, { relatedId: userId1 });
      const activity2 = createTestActivity(clubId, { relatedId: userId2 });
      const activity3 = createTestActivity(clubId, { relatedId: userId1 });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);
      await activityHelpers.insertActivity(activity3);

      const user1Activities = await t.runWithCtx((ctx) =>
        listActivitiesForRelatedResource(ctx, userId1, { cursor: null, numItems: 10 }),
      );
      const user2Activities = await t.runWithCtx((ctx) =>
        listActivitiesForRelatedResource(ctx, userId2, { cursor: null, numItems: 10 }),
      );

      expect(user1Activities.page).toHaveLength(2);
      expect(user2Activities.page).toHaveLength(1);
      expect(user1Activities.page.every((a) => a.relatedId === userId1)).toBe(true);
      expect(user2Activities.page.every((a) => a.relatedId === userId2)).toBe(true);
    });

    it("returns empty page when no activities exist for related resource", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForRelatedResource(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });
  });
});
