import schema from "@/convex/schema";
import { getOrCreatePermanentParticipants } from "@/convex/service/events/helpers/participants";
import { convexTest } from "@/convex/setup.testing";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventParticipant,
  createTestEventSeries,
  createTestTimeslot,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

const FIXED_DATE = 1704067200000; // 2024-01-01T00:00:00.000Z

describe("Participant Helpers", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let eventHelpers: EventTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    eventHelpers = new EventTestHelpers(t);
  });

  describe("getOrCreatePermanentParticipants", () => {
    it("should create new participants for permanent participants", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const seriesId = series._id;

      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId1, userId2],
            }),
          ],
        }),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreatePermanentParticipants(ctx, event);
      });

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(userId1);
      expect(result[0].eventId).toBe(event._id);
      expect(result[0].timeslotId).toBe("slot-1");
      expect(result[0].isWaitlisted).toBe(false);
      expect(result[1].userId).toBe(userId2);
    });

    it("should return existing participants when they already exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId],
            }),
          ],
        }),
      );

      // Create existing participant
      const existingParticipant = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(event._id, userId, "slot-1", FIXED_DATE),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreatePermanentParticipants(ctx, event);
      });

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe(existingParticipant._id);
      expect(result[0].userId).toBe(userId);
    });

    it("should handle multiple timeslots with permanent participants", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const seriesId = series._id;

      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId1],
            }),
            createTestTimeslot({
              id: "slot-2",
              permanentParticipants: [userId2],
            }),
          ],
        }),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreatePermanentParticipants(ctx, event);
      });

      expect(result).toHaveLength(2);
      expect(result.find((p) => p.timeslotId === "slot-1")?.userId).toBe(userId1);
      expect(result.find((p) => p.timeslotId === "slot-2")?.userId).toBe(userId2);
    });

    it("should return empty array when no permanent participants", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [],
            }),
          ],
        }),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreatePermanentParticipants(ctx, event);
      });

      expect(result).toHaveLength(0);
    });

    it("should set correct joinedAt timestamp to event date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId],
            }),
          ],
        }),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreatePermanentParticipants(ctx, event);
      });

      expect(result[0].joinedAt).toBe(FIXED_DATE);
      expect(result[0].date).toBe(FIXED_DATE);
    });
  });
});
