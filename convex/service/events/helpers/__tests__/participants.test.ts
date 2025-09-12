import schema from "@/convex/schema";
import {
  getOrCreatePermanentParticipants,
  syncPermanentParticipants,
} from "@/convex/service/events/helpers/participants";
import { convexTest } from "@/convex/setup.testing";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventParticipant,
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

      const event = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
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

      const event = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE, {
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
  });

  describe("syncPermanentParticipants", () => {
    it("should add new permanent participants", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const previousEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            {
              id: "slot-1",
              type: "duration" as const,
              duration: 60,
              feeType: "split" as const,
              maxParticipants: 10,
              maxWaitlist: 5,
              permanentParticipants: [userId1],
              numParticipants: 1,
              numWaitlisted: 0,
            },
          ],
        }),
      );

      const updatedEvent = {
        ...previousEvent,
        timeslots: [
          {
            ...previousEvent.timeslots[0],
            permanentParticipants: [userId1, userId2],
          },
        ],
      };

      await t.runWithCtx(async (ctx) => {
        await syncPermanentParticipants(ctx, updatedEvent, previousEvent);
      });

      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(previousEvent._id).edge("participants");
      });

      expect(participants).toHaveLength(1);
      expect(participants.find((p) => p.userId === userId2)).toBeDefined();
    });

    it("should remove participants no longer permanent", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const event = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            {
              id: "slot-1",
              type: "duration" as const,
              duration: 60,
              feeType: "split" as const,
              maxParticipants: 10,
              maxWaitlist: 5,
              permanentParticipants: [userId1, userId2],
              numParticipants: 2,
              numWaitlisted: 0,
            },
          ],
        }),
      );

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(event._id, userId2, "slot-1", FIXED_DATE),
      );

      const previousEvent = { ...event };
      const updatedEvent = {
        ...event,
        timeslots: [
          {
            ...event.timeslots[0],
            permanentParticipants: [userId1],
          },
        ],
      };

      await t.runWithCtx(async (ctx) => {
        await syncPermanentParticipants(ctx, updatedEvent, previousEvent);
      });

      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(event._id).edge("participants");
      });

      expect(participants.find((p) => p.userId === userId2)).toBeUndefined();
    });

    it("should handle multiple timeslots with permanent participants", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const previousEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId1],
            }),
            createTestTimeslot({
              id: "slot-2",
              permanentParticipants: [],
            }),
          ],
        }),
      );

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(previousEvent._id, userId1, "slot-1", FIXED_DATE),
      );

      const updatedEvent = {
        ...previousEvent,
        timeslots: [
          {
            ...previousEvent.timeslots[0],
            permanentParticipants: [userId1],
          },
          {
            ...previousEvent.timeslots[1],
            permanentParticipants: [userId2],
          },
        ],
      };

      await t.runWithCtx(async (ctx) => {
        await syncPermanentParticipants(ctx, updatedEvent, previousEvent);
      });

      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(previousEvent._id).edge("participants");
      });

      expect(
        participants.find((p) => p.timeslotId === "slot-1" && p.userId === userId1),
      ).toBeDefined();
      expect(
        participants.find((p) => p.timeslotId === "slot-2" && p.userId === userId2),
      ).toBeDefined();
    });

    it("should create new participation when user doesn't exist", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const previousEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId1],
            }),
          ],
        }),
      );

      // Only create participation for user1, not user2
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(previousEvent._id, userId1, "slot-1", FIXED_DATE),
      );

      const updatedEvent = {
        ...previousEvent,
        timeslots: [
          {
            ...previousEvent.timeslots[0],
            permanentParticipants: [userId1, userId2], // Add user2 to permanent (no existing participation)
          },
        ],
      };

      await t.runWithCtx(async (ctx) => {
        await syncPermanentParticipants(ctx, updatedEvent, previousEvent);
      });

      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(previousEvent._id).edge("participants");
      });

      // Should have 2 participants - user1 (existing) and user2 (newly created)
      expect(participants).toHaveLength(2);
      expect(participants.find((p) => p.userId === userId1)).toBeDefined();
      expect(participants.find((p) => p.userId === userId2)).toBeDefined();
    });

    it("should not create duplicate participants when user already exists", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const previousEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId1],
            }),
          ],
        }),
      );

      // Create existing participation for both users
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(previousEvent._id, userId1, "slot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(previousEvent._id, userId2, "slot-1", FIXED_DATE),
      );

      const updatedEvent = {
        ...previousEvent,
        timeslots: [
          {
            ...previousEvent.timeslots[0],
            permanentParticipants: [userId1, userId2], // Add user2 to permanent (already has participation)
          },
        ],
      };

      await t.runWithCtx(async (ctx) => {
        await syncPermanentParticipants(ctx, updatedEvent, previousEvent);
      });

      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(previousEvent._id).edge("participants");
      });

      // Should still have only 2 participants (no duplicates)
      expect(participants).toHaveLength(2);
      expect(participants.find((p) => p.userId === userId1)).toBeDefined();
      expect(participants.find((p) => p.userId === userId2)).toBeDefined();
    });

    it("should handle removing participants when they exist in database", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      const previousEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              id: "slot-1",
              permanentParticipants: [userId1, userId2],
            }),
          ],
        }),
      );

      // Create existing participations
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(previousEvent._id, userId1, "slot-1", FIXED_DATE),
      );
      const user2Participation = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(previousEvent._id, userId2, "slot-1", FIXED_DATE),
      );

      const updatedEvent = {
        ...previousEvent,
        timeslots: [
          {
            ...previousEvent.timeslots[0],
            permanentParticipants: [userId1], // Remove user2 from permanent
          },
        ],
      };

      await t.runWithCtx(async (ctx) => {
        await syncPermanentParticipants(ctx, updatedEvent, previousEvent);
      });

      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(previousEvent._id).edge("participants");
      });

      // Should only have user1 now
      expect(participants).toHaveLength(1);
      expect(participants.find((p) => p.userId === userId1)).toBeDefined();
      expect(participants.find((p) => p.userId === userId2)).toBeUndefined();

      // Verify user2's participation was deleted
      const deletedParticipation = await eventHelpers.getEventParticipant(user2Participation._id);
      expect(deletedParticipation).toBeNull();
    });
  });
});
