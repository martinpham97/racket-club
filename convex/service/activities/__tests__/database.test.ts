import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import schema from "@/convex/schema";
import {
  createActivity,
  getActivity,
  listActivitiesForClub,
  listActivitiesForEvent,
  listActivitiesForEventSeries,
  listActivitiesForUser,
} from "@/convex/service/activities/database";
import { convexTest } from "@/convex/setup.testing";
import { ActivityTestHelpers, createTestActivity } from "@/test-utils/samples/activities";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventSeries,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

describe("Activity Database Service", () => {
  let t: ReturnType<typeof convexTest>;
  let activityHelpers: ActivityTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let userHelpers: UserTestHelpers;
  let eventHelpers: EventTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    activityHelpers = new ActivityTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    userHelpers = new UserTestHelpers(t);
    eventHelpers = new EventTestHelpers(t);
  });

  describe("getActivity", () => {
    it("returns activity when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const activity = createTestActivity({ clubId });
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
      const activity = createTestActivity({ clubId });
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
      const activity = createTestActivity({ clubId, type: ACTIVITY_TYPES.CLUB_CREATED });
      const insertedActivity = await activityHelpers.insertActivity(activity);
      const activityId = insertedActivity._id;

      const result = await t.runWithCtx((ctx) => getActivity(ctx, activityId));

      expect(result).not.toBeNull();
      expect(result!._id).toBe(activityId);
      expect(result!.type).toBe(ACTIVITY_TYPES.CLUB_CREATED);
      expect(result!.clubId).toBe(clubId);
    });
  });

  describe("listActivitiesForClub", () => {
    it("returns paginated activities for club", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity({ clubId, type: ACTIVITY_TYPES.CLUB_CREATED });
      const activity2 = createTestActivity({ clubId, type: ACTIVITY_TYPES.CLUB_UPDATED });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForClub(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.clubId === clubId)).toBe(true);
    });

    it("returns empty page when no activities exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForClub(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("orders activities by descending date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity({ clubId });
      const activity2 = createTestActivity({ clubId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForClub(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].date).toBeGreaterThanOrEqual(result.page[1].date);
    });
  });

  describe("listActivitiesForUser", () => {
    it("returns paginated activities for user", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const activity1 = createTestActivity({ userId });
      const activity2 = createTestActivity({ userId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForUser(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.userId === userId)).toBe(true);
    });

    it("orders activities by descending date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const activity1 = createTestActivity({ userId });
      const activity2 = createTestActivity({ userId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForUser(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].date).toBeGreaterThanOrEqual(result.page[1].date);
    });
  });

  describe("createActivity", () => {
    it("inserts new activity", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const activity = createTestActivity({ clubId });

      const createdActivity = await t.runWithCtx((ctx) => createActivity(ctx, activity));
      const activityId = createdActivity._id;

      const savedActivity = await activityHelpers.getActivity(activityId);
      expect(savedActivity).not.toBeNull();
      expect(savedActivity!.clubId).toBe(clubId);
      expect(savedActivity!.createdAt).toBeDefined();
      expect(savedActivity!.date).toEqual(savedActivity!.createdAt);
    });

    it("creates activity with all optional fields", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
      const eventId = event._id;

      const activity = createTestActivity({
        clubId,
        userId,
        eventId,
        type: ACTIVITY_TYPES.EVENT_COMPLETED,
        metadata: [{ previousValue: "old", newValue: "new", fieldChanged: "name" }],
      });

      const createdActivity = await t.runWithCtx((ctx) => createActivity(ctx, activity));
      const savedActivity = await activityHelpers.getActivity(createdActivity._id);

      expect(savedActivity!.clubId).toBe(clubId);
      expect(savedActivity!.metadata).toEqual([
        { previousValue: "old", newValue: "new", fieldChanged: "name" },
      ]);
    });
  });

  describe("edge cases and error handling", () => {
    it("handles activities with same timestamp in correct order", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const activity1 = createTestActivity({ clubId });
      const activity2 = createTestActivity({ clubId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForClub(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
    });

    it("handles pagination with numItems limit", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      for (let i = 0; i < 3; i++) {
        await activityHelpers.insertActivity(createTestActivity({ clubId }));
      }

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForClub(ctx, clubId, { cursor: null, numItems: 2 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.isDone).toBe(false);
    });

    it("filters activities correctly for different users", async () => {
      const user1 = await userHelpers.insertUser();
      const user2 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const userId2 = user2._id;

      const activity1 = createTestActivity({ userId: userId1 });
      const activity2 = createTestActivity({ userId: userId2 });
      const activity3 = createTestActivity({ userId: userId1 });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);
      await activityHelpers.insertActivity(activity3);

      const user1Activities = await t.runWithCtx((ctx) =>
        listActivitiesForUser(ctx, userId1, { cursor: null, numItems: 10 }),
      );
      const user2Activities = await t.runWithCtx((ctx) =>
        listActivitiesForUser(ctx, userId2, { cursor: null, numItems: 10 }),
      );

      expect(user1Activities.page).toHaveLength(2);
      expect(user2Activities.page).toHaveLength(1);
      expect(user1Activities.page.every((a) => a.userId === userId1)).toBe(true);
      expect(user2Activities.page.every((a) => a.userId === userId2)).toBe(true);
    });

    it("returns empty page when no activities exist for user", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForUser(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });
  });

  describe("listActivitiesForEvent", () => {
    it("returns paginated activities for event", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
      const eventId = event._id;

      const activity1 = createTestActivity({ eventId, type: ACTIVITY_TYPES.EVENT_CREATED });
      const activity2 = createTestActivity({ eventId, type: ACTIVITY_TYPES.EVENT_COMPLETED });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForEvent(ctx, eventId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.eventId === eventId)).toBe(true);
    });

    it("returns empty page when no activities exist for event", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
      const eventId = event._id;

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForEvent(ctx, eventId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("orders activities by descending date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
      const eventId = event._id;

      const activity1 = createTestActivity({ eventId });
      const activity2 = createTestActivity({ eventId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForEvent(ctx, eventId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].date).toBeGreaterThanOrEqual(result.page[1].date);
    });
  });

  describe("listActivitiesForEventSeries", () => {
    it("returns paginated activities for event series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const eventSeriesId = eventSeries._id;

      const activity1 = createTestActivity({
        eventSeriesId,
        type: ACTIVITY_TYPES.EVENT_SERIES_CREATED,
      });
      const activity2 = createTestActivity({
        eventSeriesId,
        type: ACTIVITY_TYPES.EVENT_SERIES_UPDATED,
      });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForEventSeries(ctx, eventSeriesId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((activity) => activity.eventSeriesId === eventSeriesId)).toBe(true);
    });

    it("returns empty page when no activities exist for event series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const eventSeriesId = eventSeries._id;

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForEventSeries(ctx, eventSeriesId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("orders activities by descending date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const eventSeriesId = eventSeries._id;

      const activity1 = createTestActivity({ eventSeriesId });
      const activity2 = createTestActivity({ eventSeriesId });

      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const result = await t.runWithCtx((ctx) =>
        listActivitiesForEventSeries(ctx, eventSeriesId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page[0].date).toBeGreaterThanOrEqual(result.page[1].date);
    });
  });
});
