import {
  EVENT_TIMESLOT_FULL_ERROR,
  EVENT_TIMESLOT_INVALID_ID_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import {
  findUserParticipationByTimeslotId,
  getTimeslotOrThrow,
  promoteWaitlistedParticipant,
  shouldUserBeWaitlisted,
} from "@/convex/service/events/helpers/timeslots";
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

describe("Timeslot Helpers", () => {
  let t: ReturnType<typeof convexTest>;
  let clubHelpers: ClubTestHelpers;
  let userHelpers: UserTestHelpers;
  let eventHelpers: EventTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    eventHelpers = new EventTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    userHelpers = new UserTestHelpers(t);
  });

  describe("getTimeslotOrThrow", () => {
    it("should return timeslot when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const timeslot = createTestTimeslot({ id: "slot1" });
      const eventData = createTestEvent(seriesId, clubId, userId, Date.now(), {
        timeslots: [timeslot],
      });
      const event = await eventHelpers.insertEvent(eventData);
      const eventId = event._id;
      const eventRecord = await eventHelpers.getEvent(eventId);

      const result = getTimeslotOrThrow(eventRecord!, "slot1");
      expect(result.id).toBe("slot1");
    });

    it("should throw when timeslot not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const eventData = createTestEvent(seriesId, clubId, userId, Date.now(), { timeslots: [] });
      const event = await eventHelpers.insertEvent(eventData);
      const eventId = event._id;
      const eventRecord = await eventHelpers.getEvent(eventId);

      expect(() => getTimeslotOrThrow(eventRecord!, "nonexistent")).toThrow(
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
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, Date.now()),
      );
      const eventId = event._id;

      const participantData = createTestEventParticipant(eventId, userId, "slot1", Date.now(), {
        isWaitlisted: false,
      });
      const participant = await eventHelpers.insertEventParticipant(participantData);
      const participantId = participant._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await findUserParticipationByTimeslotId(ctx, eventId, userId, "slot1");
      });

      expect(result?._id).toBe(participantId);
    });

    it("should return undefined when not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, Date.now()),
      );
      const eventId = event._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await findUserParticipationByTimeslotId(ctx, eventId, userId, "slot1");
      });

      expect(result).toBeNull();
    });
  });

  describe("promoteWaitlistedParticipant", () => {
    it("should promote single waitlisted participant", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const seriesId = series._id;

      const timeslot = createTestTimeslot({ maxParticipants: 10, id: "slot1" });
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );
      const eventId = event._id;

      const participant1 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), {
          isWaitlisted: true,
        }),
      );
      const participant1Id = participant1._id;

      await t.runWithCtx(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      const participant = await eventHelpers.getEventParticipant(participant1Id);
      expect(participant?.isWaitlisted).toBe(false);
    });

    it("should promote earliest of multiple waitlisted participants", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const user3 = await userHelpers.insertUser("user3@test.com");
      const userId3 = user3._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const seriesId = series._id;

      const timeslot = createTestTimeslot({ maxParticipants: 10, id: "slot1" });
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );
      const eventId = event._id;

      // Insert in order where earliest is not first
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), {
          isWaitlisted: true,
          joinedAt: Date.now() - 1000, // Later
        }),
      );
      const participant2 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "slot1", Date.now(), {
          isWaitlisted: true,
          joinedAt: Date.now() - 3000, // Earliest
        }),
      );
      const participant2Id = participant2._id;
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId3, "slot1", Date.now(), {
          isWaitlisted: true,
          joinedAt: Date.now() - 2000, // Middle
        }),
      );

      await t.runWithCtx(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      const participant = await eventHelpers.getEventParticipant(participant2Id);
      expect(participant?.isWaitlisted).toBe(false);
    });

    it("should not promote when timeslot is at capacity", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const user3 = await userHelpers.insertUser("user3@test.com");
      const userId3 = user3._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const seriesId = series._id;

      const timeslot = createTestTimeslot({ maxParticipants: 2, id: "slot1" });
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );
      const eventId = event._id;

      // Fill capacity with active participants
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), { isWaitlisted: false }),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "slot1", Date.now(), { isWaitlisted: false }),
      );

      // Add waitlisted participant
      const waitlisted = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId3, "slot1", Date.now(), { isWaitlisted: true }),
      );
      const waitlistedId = waitlisted._id;

      await t.runWithCtx(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      const participant = await eventHelpers.getEventParticipant(waitlistedId);
      expect(participant?.isWaitlisted).toBe(true);
    });

    it("should do nothing when no waitlisted participants exist", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const seriesId = series._id;

      const timeslot = createTestTimeslot({ maxParticipants: 10, id: "slot1" });
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, Date.now(), { timeslots: [timeslot] }),
      );
      const eventId = event._id;

      // Only active participants, no waitlisted
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "slot1", Date.now(), { isWaitlisted: false }),
      );

      await t.runWithCtx(async (ctx) => {
        await promoteWaitlistedParticipant(ctx, eventId, "slot1", timeslot);
      });

      // Should complete without error
      expect(true).toBe(true);
    });
  });
});
