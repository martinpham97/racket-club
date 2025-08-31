import { EVENT_STATUS } from "@/convex/constants/events";
import schema from "@/convex/schema";
import {
  createEvent,
  createEventSeries,
  getEventAtDate,
  listAllEventParticipants,
  listEventParticipationsForUser,
  listEventSeriesForClub,
  listEventsForClub,
  listParticipatingEvents,
  searchEvents,
  updateEventSeries,
} from "@/convex/service/events/database";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventInput,
  createTestEventParticipant,
  createTestEventSeries,
  createTestEventSeriesInput,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

// Fixed timestamp for consistent test data
const FIXED_DATE = 1704067200000; // 2024-01-01T00:00:00.000Z

describe("Events Database Service", () => {
  const t = convexTest(schema);
  const eventHelpers = new EventTestHelpers(t);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  describe("createEventSeries", () => {
    it("creates event series with correct data", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const input = createTestEventSeriesInput(clubId);

      const seriesId = await t.run(async (ctx) => {
        return await createEventSeries(ctx, input, userId);
      });

      const series = await eventHelpers.getEventSeries(seriesId);
      expect(series!.name).toBe(input.name);
      expect(series!.clubId).toBe(clubId);
      expect(series!.createdBy).toBe(userId);
    });
  });

  describe("listEventSeriesForClub", () => {
    it("returns paginated event series for a club", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const series1 = createTestEventSeries(clubId, userId);
      const series2 = createTestEventSeries(clubId, userId, { name: "Series 2" });

      await eventHelpers.insertEventSeries(series1);
      await eventHelpers.insertEventSeries(series2);

      const result = await t.run(async (ctx) => {
        return await listEventSeriesForClub(ctx, clubId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((s) => s.clubId === clubId)).toBe(true);
    });
  });

  describe("createEvent", () => {
    it("creates event with correct data", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const eventInput = createTestEventInput(clubId, { date: FIXED_DATE });

      const eventId = await t.run(async (ctx) => {
        return await createEvent(ctx, userId, eventInput, seriesId);
      });

      const event = await eventHelpers.getEvent(eventId);
      expect(event!.name).toBe(eventInput.name);
      expect(event!.date).toBe(FIXED_DATE);
      expect(event!.eventSeriesId).toBe(seriesId);
      expect(event!.status).toBe(EVENT_STATUS.NOT_STARTED);
    });
  });

  describe("getEventAtDate", () => {
    it("returns event for specific date and series", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const event = createTestEvent(seriesId, clubId, userId, FIXED_DATE);
      const eventId = await eventHelpers.insertEvent(event);

      const result = await t.run(async (ctx) => {
        return await getEventAtDate(ctx, seriesId, FIXED_DATE);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(eventId);
      expect(result!.date).toBe(FIXED_DATE);
    });

    it("returns null when no event exists for date", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      const result = await t.run(async (ctx) => {
        return await getEventAtDate(ctx, seriesId, FIXED_DATE);
      });

      expect(result).toBeNull();
    });
  });

  describe("listEventsForClub", () => {
    it("returns events for a club within date range", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      // Create events on different dates
      const event1 = createTestEvent(seriesId, clubId, userId, FIXED_DATE);
      const event2 = createTestEvent(seriesId, clubId, userId, FIXED_DATE + 86400000);
      const event3 = createTestEvent(seriesId, clubId, userId, FIXED_DATE + 172800000); // Outside range

      await eventHelpers.insertEvent(event1);
      await eventHelpers.insertEvent(event2);
      await eventHelpers.insertEvent(event3);

      const result = await t.run(async (ctx) => {
        return await listEventsForClub(
          ctx,
          clubId,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((event) => event.clubId === clubId)).toBe(true);
    });
  });

  describe("listEventParticipationsForUser", () => {
    it("returns user participations for an event", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, FIXED_DATE),
      );

      const participant = createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE);
      await eventHelpers.insertEventParticipant(participant);

      const result = await t.run(async (ctx) => {
        return await listEventParticipationsForUser(ctx, eventId, userId);
      });

      expect(result).toHaveLength(1);
      expect(result[0].eventId).toBe(eventId);
      expect(result[0].userId).toBe(userId);
    });
  });

  describe("listAllEventParticipants", () => {
    it("returns all participants for an event", async () => {
      const userId1 = await userHelpers.insertUser("user1@test.com");
      const userId2 = await userHelpers.insertUser("user2@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId1));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId1));
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId1, FIXED_DATE),
      );

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "timeslot-1", FIXED_DATE),
      );

      const result = await t.run(async (ctx) => {
        return await listAllEventParticipants(ctx, eventId);
      });

      expect(result).toHaveLength(2);
      expect(result.every((p) => p.eventId === eventId)).toBe(true);
    });
  });

  describe("listParticipatingEvents", () => {
    it("returns events with participation details for a user", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, FIXED_DATE),
      );

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );

      const result = await t.run(async (ctx) => {
        return await listParticipatingEvents(
          ctx,
          userId,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(eventId);
      expect(result.page[0].participation).toBeDefined();
      expect(result.page[0].participation.userId).toBe(userId);
    });

    it("filters out participations for deleted events", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const eventId = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, FIXED_DATE),
      );

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );

      // Delete the event but leave participation record
      await t.run(async (ctx) => {
        await ctx.db.delete(eventId);
      });

      const result = await t.run(async (ctx) => {
        return await listParticipatingEvents(
          ctx,
          userId,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(0);
    });
  });

  describe("searchEvents", () => {
    it("searches events with text query", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesId = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      const tennisEvent = createTestEvent(seriesId, clubId, userId, FIXED_DATE, {
        name: "Tennis Tournament",
      });
      const basketballEvent = createTestEvent(seriesId, clubId, userId, FIXED_DATE, {
        name: "Basketball Game",
      });

      await eventHelpers.insertEvent(tennisEvent);
      await eventHelpers.insertEvent(basketballEvent);

      const result = await t.run(async (ctx) => {
        return await searchEvents(
          ctx,
          "tennis",
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
          [],
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].name).toContain("Tennis");
    });
  });

  describe("updateEventSeries", () => {
    it("updates event series with modifiedAt timestamp", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const series = createTestEventSeries(clubId, userId, { name: "Original Name" });
      const seriesId = await eventHelpers.insertEventSeries(series);
      const originalModifiedAt = series.modifiedAt!;

      // Wait to check for updated modifiedAt time
      await new Promise((resolve) => setTimeout(resolve, 500));

      await t.run(async (ctx) => {
        await updateEventSeries(ctx, seriesId, { name: "Updated Name" });
      });

      const updated = await eventHelpers.getEventSeries(seriesId);
      expect(updated!.name).toBe("Updated Name");
      expect(updated!.modifiedAt).toBeGreaterThan(originalModifiedAt);
    });
  });
});
