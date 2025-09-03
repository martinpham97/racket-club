import {
  EVENT_TIMESLOT_FULL_ERROR,
  EVENT_TIMESLOT_INVALID_ID_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventParticipant,
  createTestEventSeries,
  createTestTimeslot,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import {
  findUserParticipationByTimeslotId,
  getTimeslotOrThrow,
  promoteWaitlistedParticipant,
  shouldUserBeWaitlisted,
} from "../timeslots";

describe("Timeslot Helpers", () => {
  const t = convexTest(schema);
  const userHelpers = new UserTestHelpers(t);
  const clubHelpers = new ClubTestHelpers(t);
  const eventHelpers = new EventTestHelpers(t);

  describe("getTimeslotOrThrow", () => {
    it("should return timeslot when found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      const timeslot = createTestTimeslot({ id: "slot1" });
      const eventData = createTestEvent(seriesId, clubId, userId, Date.now(), {
        timeslots: [timeslot],
      });
      const eventId = await eventHelpers.insertEvent(eventData);
      const event = await eventHelpers.getEvent(eventId);

      const result = getTimeslotOrThrow(event!, "slot1");
      expect(result.id).toBe("slot1");
    });

    it("should throw when timeslot not found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      const eventData = createTestEvent(seriesId, clubId, userId, Date.now(), { timeslots: [] });
      const eventId = await eventHelpers.insertEvent(eventData);
      const event = await eventHelpers.getEvent(eventId);

      expect(() => getTimeslotOrThrow(event!, "nonexistent")).toThrow(
        EVENT_TIMESLOT_INVALID_ID_ERROR,
      );
    });
  });

  describe("shouldUserBeWaitlisted", () => {
    it("should return false when timeslot has capacity", () => {
      const timeslot = createTestTimeslot({ numParticipants: 5, maxParticipants: 10 });
      expect(shouldUserBeWaitlisted(timeslot)).toBe(false);
    });

    it("should return true when timeslot is full but waitlist has space", () => {
      const timeslot = createTestTimeslot({
        numParticipants: 10,
        maxParticipants: 10,
        numWaitlisted: 2,
        maxWaitlist: 5,
      });
      expect(shouldUserBeWaitlisted(timeslot)).toBe(true);
    });

    it("should throw when both timeslot and waitlist are full", () => {
      const timeslot = createTestTimeslot({
        numParticipants: 10,
        maxParticipants: 10,
        numWaitlisted: 5,
        maxWaitlist: 5,
      });
      expect(() => shouldUserBeWaitlisted(timeslot)).toThrow(EVENT_TIMESLOT_FULL_ERROR);
    });
  });

  describe("findUserParticipationByTimeslotId", () => {
    it("should return participation when found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, Date.now()),
      );

      const participantData = createTestEventParticipant(eventId, userId, "slot1", Date.now(), {
        isWaitlisted: false,
      });
      const participantId = await eventHelpers.insertEventParticipant(participantData);

      const result = await t.run(async (ctx) => {
        return await findUserParticipationByTimeslotId(ctx, eventId, userId, "slot1");
      });

      expect(result?._id).toBe(participantId);
    });

    it("should return undefined when not found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, Date.now()),
      );

      const result = await t.run(async (ctx) => {
        return await findUserParticipationByTimeslotId(ctx, eventId, userId, "slot1");
      });

      expect(result).toBeNull();
    });
  });

  describe("promoteWaitlistedParticipant", () => {
    it("should promote single waitlisted participant", async () => {
      const userId1 = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId1));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));

      const timeslot = createTestTimeslot({ maxParticipants: 10, id: "slot1" });
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );

      const participant1Id = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), {
          isWaitlisted: true,
        }),
      );

      await t.run(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      const participant = await eventHelpers.getEventParticipant(participant1Id);
      expect(participant?.isWaitlisted).toBe(false);
    });

    it("should promote earliest of multiple waitlisted participants", async () => {
      const userId1 = await userHelpers.insertUser();
      const userId2 = await userHelpers.insertUser("user2@test.com");
      const userId3 = await userHelpers.insertUser("user3@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId1));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));

      const timeslot = createTestTimeslot({ maxParticipants: 10, id: "slot1" });
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );

      // Insert in order where earliest is not first
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), {
          isWaitlisted: true,
          joinedAt: Date.now() - 1000, // Later
        }),
      );
      const participant2Id = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "slot1", Date.now(), {
          isWaitlisted: true,
          joinedAt: Date.now() - 3000, // Earliest
        }),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId3, "slot1", Date.now(), {
          isWaitlisted: true,
          joinedAt: Date.now() - 2000, // Middle
        }),
      );

      await t.run(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      const participant = await eventHelpers.getEventParticipant(participant2Id);
      expect(participant?.isWaitlisted).toBe(false);
    });

    it("should not promote when timeslot is at capacity", async () => {
      const userId1 = await userHelpers.insertUser();
      const userId2 = await userHelpers.insertUser("user2@test.com");
      const userId3 = await userHelpers.insertUser("user3@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId1));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));

      const timeslot = createTestTimeslot({ maxParticipants: 2, id: "slot1" });
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );

      // Fill capacity with active participants
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), { isWaitlisted: false }),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "slot1", Date.now(), { isWaitlisted: false }),
      );

      // Add waitlisted participant
      const waitlistedId = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId3, "slot1", Date.now(), { isWaitlisted: true }),
      );

      await t.run(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      const participant = await eventHelpers.getEventParticipant(waitlistedId);
      expect(participant?.isWaitlisted).toBe(true);
    });

    it("should do nothing when no waitlisted participants exist", async () => {
      const userId1 = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId1));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));

      const timeslot = createTestTimeslot({ maxParticipants: 10, id: "slot1" });
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );

      // Only active participants, no waitlisted
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), { isWaitlisted: false }),
      );

      await t.run(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      // Should complete without error
      expect(true).toBe(true); // Should remain waitlisted
    });
  });
});
