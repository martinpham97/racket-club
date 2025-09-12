import { EVENT_NOT_FOUND_ERROR, EVENT_SERIES_NOT_FOUND_ERROR } from "@/convex/constants/errors";
import { EVENT_STATUS } from "@/convex/constants/events";
import schema from "@/convex/schema";
import {
  addEventTimeslot,
  createEvent,
  createEventParticipation,
  createEventSeries,
  deleteEventParticipation,
  getEventAtDate,
  getEventOrThrow,
  getEventSeriesOrThrow,
  getOrCreateEventFromSeries,
  listAllEventParticipants,
  listAllEventParticipantsForTimeslot,
  listEventParticipationsForUser,
  listEventSeriesForClub,
  listEventsForClub,
  listParticipatingEvents,
  removeEventTimeslotWithParticipants,
  searchEvents,
  updateEvent,
  updateEventSeries,
  updateEventTimeslot,
} from "@/convex/service/events/database";
import { convexTest } from "@/convex/setup.testing";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventInput,
  createTestEventParticipant,
  createTestEventSeries,
  createTestEventSeriesInput,
  createTestTimeslot,
  createTestTimeslotInput,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

// Fixed timestamp for consistent test data
const FIXED_DATE = 1704067200000; // 2024-01-01T00:00:00.000Z

describe("Events Database Service", () => {
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

  describe("createEventSeries", () => {
    it("creates event series with correct data", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const input = createTestEventSeriesInput(clubId);

      const series = await t.runWithCtx(async (ctx) => {
        return await createEventSeries(ctx, input, userId);
      });

      expect(series!.name).toBe(input.name);
      expect(series!.clubId).toBe(clubId);
      expect(series!.createdBy).toBe(userId);
      expect(series!.createdAt).toBeDefined();
      expect(series!.modifiedAt).toBeDefined();
    });
  });

  describe("listEventSeriesForClub", () => {
    it("returns paginated event series for a club", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series1 = createTestEventSeries(clubId, userId);
      const series2 = createTestEventSeries(clubId, userId, { name: "Series 2" });

      await eventHelpers.insertEventSeries(series1);
      await eventHelpers.insertEventSeries(series2);

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventSeriesForClub(ctx, clubId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((s) => s.clubId === clubId)).toBe(true);
    });

    it("returns empty page when club has no event series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventSeriesForClub(ctx, clubId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(0);
    });

    it("filters by club correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId1 = club1._id;
      const club2 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId2 = club2._id;

      await eventHelpers.insertEventSeries(createTestEventSeries(clubId1, userId));
      await eventHelpers.insertEventSeries(createTestEventSeries(clubId2, userId));

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventSeriesForClub(ctx, clubId1, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].clubId).toBe(clubId1);
    });
  });

  describe("createEvent", () => {
    it("creates event with correct data", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const seriesId = insertedSeries._id;
      const eventInput = createTestEventInput(clubId, { date: FIXED_DATE });

      const event = await t.runWithCtx(async (ctx) => {
        return await createEvent(ctx, userId, eventInput, seriesId);
      });

      expect(event!.name).toBe(eventInput.name);
      expect(event!.date).toBe(FIXED_DATE);
      expect(event!.eventSeriesId).toBe(seriesId);
      expect(event!.status).toBe(EVENT_STATUS.NOT_STARTED);
      expect(event!.createdAt).toBeDefined();
      expect(event!.modifiedAt).toBeDefined();
    });
  });

  describe("getEventAtDate", () => {
    it("returns event for specific date and series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const seriesId = insertedSeries._id;
      const eventData = createTestEvent(clubId, userId, FIXED_DATE, { eventSeriesId: seriesId });
      const insertedEvent = await eventHelpers.insertEvent(eventData);
      const eventId = insertedEvent._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventAtDate(ctx, seriesId, FIXED_DATE);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(eventId);
      expect(result!.date).toBe(FIXED_DATE);
    });

    it("returns null when no event exists for date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const seriesId = insertedSeries._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventAtDate(ctx, seriesId, FIXED_DATE);
      });

      expect(result).toBeNull();
    });
  });

  describe("listEventsForClub", () => {
    it("returns events for a club within date range", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      // Create events on different dates
      const event1 = createTestEvent(clubId, userId, FIXED_DATE);
      const event2 = createTestEvent(clubId, userId, FIXED_DATE + 86400000);
      const event3 = createTestEvent(clubId, userId, FIXED_DATE + 172800000); // Outside range

      await eventHelpers.insertEvent(event1);
      await eventHelpers.insertEvent(event2);
      await eventHelpers.insertEvent(event3);

      const result = await t.runWithCtx(async (ctx) => {
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

    it("returns events ordered by date ascending", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const laterEvent = createTestEvent(clubId, userId, FIXED_DATE + 86400000);
      const earlierEvent = createTestEvent(clubId, userId, FIXED_DATE);

      // Insert in reverse order
      await eventHelpers.insertEvent(laterEvent);
      await eventHelpers.insertEvent(earlierEvent);

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventsForClub(
          ctx,
          clubId,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 172800000 },
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(2);
      expect(result.page[0].date).toBeLessThan(result.page[1].date);
    });

    it("returns empty page when no events in range", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventsForClub(
          ctx,
          clubId,
          { fromDate: FIXED_DATE, toDate: FIXED_DATE + 86400000 },
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(0);
    });
  });

  describe("listEventParticipationsForUser", () => {
    it("returns user participations for an event", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      const participant = createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE);
      await eventHelpers.insertEventParticipant(participant);

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventParticipationsForUser(ctx, eventId, userId);
      });

      expect(result).toHaveLength(1);
      expect(result[0].eventId).toBe(eventId);
      expect(result[0].userId).toBe(userId);
    });

    it("returns multiple participations for same user in different timeslots", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-2", FIXED_DATE),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventParticipationsForUser(ctx, eventId, userId);
      });

      expect(result).toHaveLength(2);
      expect(result.every((p) => p.userId === userId && p.eventId === eventId)).toBe(true);
    });

    it("returns empty array when user has no participations", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await listEventParticipationsForUser(ctx, eventId, userId);
      });

      expect(result).toHaveLength(0);
    });
  });

  describe("listAllEventParticipants", () => {
    it("returns all participants for an event", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "timeslot-1", FIXED_DATE),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await listAllEventParticipants(ctx, eventId);
      });

      expect(result).toHaveLength(2);
      expect(result.every((p) => p.eventId === eventId)).toBe(true);
    });
  });

  describe("listAllEventParticipantsForTimeslot", () => {
    it("returns participants for specific timeslot", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "timeslot-2", FIXED_DATE),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await listAllEventParticipantsForTimeslot(ctx, eventId, "timeslot-1");
      });

      expect(result).toHaveLength(2);
      expect(result.every((p) => p.timeslotId === "timeslot-1")).toBe(true);
    });

    it("returns empty array when no participants in timeslot", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await listAllEventParticipantsForTimeslot(ctx, eventId, "nonexistent-timeslot");
      });

      expect(result).toHaveLength(0);
    });

    it("filters by both event and timeslot correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event1 = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const event1Id = event1._id;
      const event2 = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE + 86400000),
      );
      const event2Id = event2._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(event1Id, userId, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(event2Id, userId, "timeslot-1", FIXED_DATE + 86400000),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await listAllEventParticipantsForTimeslot(ctx, event1Id, "timeslot-1");
      });

      expect(result).toHaveLength(1);
      expect(result[0].eventId).toBe(event1Id);
      expect(result[0].timeslotId).toBe("timeslot-1");
    });
  });

  describe("listParticipatingEvents", () => {
    it("returns events with participation details for a user", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );

      const result = await t.runWithCtx(async (ctx) => {
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
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      // Create a valid event and participation first
      const validEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE + 86400000),
      );
      const validEventId = validEvent._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(validEventId, userId, "timeslot-1", FIXED_DATE + 86400000),
      );

      // Delete one event but leave participation record
      await eventHelpers.deleteEvent(eventId);

      const result = await t.runWithCtx(async (ctx) => {
        return await listParticipatingEvents(
          ctx,
          userId,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 172800000 },
          { cursor: null, numItems: 10 },
        );
      });

      // Should only return the valid event, filtering out the deleted one
      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(validEventId);
    });

    it("filters by date range correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const eventInRange = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventInRangeId = eventInRange._id;
      const eventOutOfRange = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE + 172800000),
      );
      const eventOutOfRangeId = eventOutOfRange._id;

      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventInRangeId, userId, "timeslot-1", FIXED_DATE),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventOutOfRangeId, userId, "timeslot-1", FIXED_DATE + 172800000),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await listParticipatingEvents(
          ctx,
          userId,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(eventInRangeId);
    });

    it("returns empty page when user has no participations in date range", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const result = await t.runWithCtx(async (ctx) => {
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
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const tennisEvent = createTestEvent(clubId, userId, FIXED_DATE, {
        name: "Tennis Tournament",
      });
      const basketballEvent = createTestEvent(clubId, userId, FIXED_DATE, {
        name: "Basketball Game",
      });

      await eventHelpers.insertEvent(tennisEvent);
      await eventHelpers.insertEvent(basketballEvent);

      const result = await t.runWithCtx(async (ctx) => {
        return await searchEvents(
          ctx,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000, query: "tennis" },
          [],
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].name).toContain("Tennis");
    });

    it("returns events ordered by date ascending", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const laterEvent = createTestEvent(clubId, userId, FIXED_DATE + 86400000);
      const earlierEvent = createTestEvent(clubId, userId, FIXED_DATE);

      await eventHelpers.insertEvent(laterEvent);
      await eventHelpers.insertEvent(earlierEvent);

      const result = await t.runWithCtx(async (ctx) => {
        return await searchEvents(
          ctx,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 172800000 },
          [],
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(2);
      expect(result.page[0].date).toBeLessThan(result.page[1].date);
    });

    it("applies event filters correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE + 86400000));

      const result = await t.runWithCtx(async (ctx) => {
        return await searchEvents(
          ctx,
          { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
          [clubId],
          { cursor: null, numItems: 10 },
        );
      });

      expect(result.page).toHaveLength(2);
    });
  });

  describe("getEventSeriesOrThrow", () => {
    it("returns event series when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const seriesId = insertedSeries._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventSeriesOrThrow(ctx, seriesId);
      });

      expect(result._id).toBe(seriesId);
      expect(result.clubId).toBe(clubId);
      expect(result.createdBy).toBe(userId);
    });

    it("throws EVENT_SERIES_NOT_FOUND_ERROR when event series not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedSeries = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId),
      );
      const seriesId = insertedSeries._id;
      await eventHelpers.deleteEventSeries(seriesId);

      await t.runWithCtx(async (ctx) => {
        await expect(getEventSeriesOrThrow(ctx, seriesId)).rejects.toThrow(
          EVENT_SERIES_NOT_FOUND_ERROR,
        );
      });
    });

    it("returns complete event series data", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesData = createTestEventSeries(clubId, userId, {
        name: "Test Series",
        description: "Test Description",
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesData);
      const seriesId = insertedSeries._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventSeriesOrThrow(ctx, seriesId);
      });

      expect(result.name).toBe("Test Series");
      expect(result.description).toBe("Test Description");
      expect(result.isActive).toBeDefined();
      expect(result.schedule).toBeDefined();
      expect(result.timeslots).toBeDefined();
    });
  });

  describe("getEventOrThrow", () => {
    it("returns event when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventOrThrow(ctx, eventId);
      });

      expect(result._id).toBe(eventId);
      expect(result.clubId).toBe(clubId);
      expect(result.date).toBe(FIXED_DATE);
    });

    it("throws EVENT_NOT_FOUND_ERROR when event not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      await eventHelpers.deleteEvent(eventId);

      await t.runWithCtx(async (ctx) => {
        await expect(getEventOrThrow(ctx, eventId)).rejects.toThrow(EVENT_NOT_FOUND_ERROR);
      });
    });

    it("returns complete event data", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventData = createTestEvent(clubId, userId, FIXED_DATE, {
        name: "Test Event",
        description: "Test Description",
      });
      const insertedEvent = await eventHelpers.insertEvent(eventData);
      const eventId = insertedEvent._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventOrThrow(ctx, eventId);
      });

      expect(result.name).toBe("Test Event");
      expect(result.description).toBe("Test Description");
      expect(result.status).toBe(EVENT_STATUS.NOT_STARTED);
      expect(result.timeslots).toBeDefined();
      expect(result.location).toBeDefined();
      expect(result.createdBy).toBe(userId);
    });

    it("returns event without event series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventInput = createTestEventInput(clubId, { date: FIXED_DATE });

      const insertedEvent = await t.runWithCtx(async (ctx) => {
        return await createEvent(ctx, userId, eventInput);
      });
      const eventId = insertedEvent._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await getEventOrThrow(ctx, eventId);
      });

      expect(result._id).toBe(eventId);
      expect(result.eventSeriesId).toBeUndefined();
      expect(result.clubId).toBe(clubId);
    });
  });

  describe("createEvent", () => {
    it("creates event without event series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventInput = createTestEventInput(clubId, { date: FIXED_DATE });

      const event = await t.runWithCtx(async (ctx) => {
        return await createEvent(ctx, userId, eventInput);
      });

      expect(event!.eventSeriesId).toBeUndefined();
      expect(event!.status).toBe(EVENT_STATUS.NOT_STARTED);
    });

    it("generates timeslot IDs and sets participant counts", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventInput = createTestEventInput(clubId, {
        date: FIXED_DATE,
        timeslots: [
          {
            type: "duration",
            duration: 60,
            feeType: "split",
            maxParticipants: 10,
            maxWaitlist: 5,
            permanentParticipants: [userId],
          },
        ],
      });

      const event = await t.runWithCtx(async (ctx) => {
        return await createEvent(ctx, userId, eventInput);
      });

      expect(event!.timeslots[0].id).toBeDefined();
      expect(event!.timeslots[0].numParticipants).toBe(1);
      expect(event!.timeslots[0].numWaitlisted).toBe(0);
    });
  });

  describe("updateEvent", () => {
    it("updates event with modifiedAt timestamp", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      const originalEvent = await eventHelpers.getEvent(eventId);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await t.runWithCtx(async (ctx) => {
        await updateEvent(ctx, eventId, { name: "Updated Event" });
      });

      const updated = await eventHelpers.getEvent(eventId);
      expect(updated!.name).toBe("Updated Event");
      expect(updated!.modifiedAt).toBeGreaterThan(originalEvent!.modifiedAt!);
    });
  });

  describe("createEventParticipation", () => {
    it("creates event participation record", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      const participation = {
        eventId,
        userId,
        timeslotId: "slot-1",
        joinedAt: Date.now(),
        date: FIXED_DATE,
        isWaitlisted: false,
      };

      const result = await t.runWithCtx(async (ctx) => {
        return await createEventParticipation(ctx, participation);
      });

      expect(result.eventId).toBe(eventId);
      expect(result.userId).toBe(userId);
      expect(result.isWaitlisted).toBe(false);
    });
  });

  describe("deleteEventParticipation", () => {
    it("deletes event participation record", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      const insertedParticipant = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );
      const participantId = insertedParticipant._id;

      await t.runWithCtx(async (ctx) => {
        await deleteEventParticipation(ctx, participantId);
      });

      const deletedParticipant = await eventHelpers.getEventParticipant(participantId);
      expect(deletedParticipant).toBeNull();
    });

    it("removes all participants when event is deleted", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE),
      );
      const eventId = insertedEvent._id;

      const participant1 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, "timeslot-1", FIXED_DATE),
      );
      const participant2 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, "timeslot-1", FIXED_DATE),
      );

      await eventHelpers.deleteEvent(eventId);

      const deletedParticipant1 = await eventHelpers.getEventParticipant(participant1._id);
      const deletedParticipant2 = await eventHelpers.getEventParticipant(participant2._id);
      expect(deletedParticipant1).toBeNull();
      expect(deletedParticipant2).toBeNull();
    });
  });

  describe("updateEventSeries", () => {
    it("updates event series with modifiedAt timestamp", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesData = createTestEventSeries(clubId, userId, { name: "Original Name" });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesData);
      const seriesId = insertedSeries._id;
      const originalModifiedAt = seriesData.modifiedAt!;

      // Wait to check for updated modifiedAt time
      await new Promise((resolve) => setTimeout(resolve, 500));

      await t.runWithCtx(async (ctx) => {
        await updateEventSeries(ctx, seriesId, { name: "Updated Name" });
      });

      const updated = await eventHelpers.getEventSeries(seriesId);
      expect(updated!.name).toBe("Updated Name");
      expect(updated!.modifiedAt).toBeGreaterThan(originalModifiedAt);
    });
  });

  describe("getOrCreateEventFromSeries", () => {
    it("should return existing event when one exists for the date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const existingEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE, {
          name: "Existing Event",
          eventSeriesId: seriesId,
        }),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreateEventFromSeries(ctx, series, FIXED_DATE);
      });

      expect(result._id).toBe(existingEvent._id);
      expect(result.name).toBe("Existing Event");
    });

    it("should create new event when none exists for the date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreateEventFromSeries(ctx, series, FIXED_DATE);
      });

      expect(result.name).toBe(series.name);
      expect(result.date).toBe(FIXED_DATE);
      expect(result.eventSeriesId).toBe(series._id);
      expect(result.createdBy).toBe(userId);
    });

    it("should create event with correct data from series", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, {
          name: "Tennis Tournament",
          description: "Weekly tennis event",
          startTime: "18:00",
          endTime: "20:00",
        }),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await getOrCreateEventFromSeries(ctx, series, FIXED_DATE);
      });

      expect(result.name).toBe("Tennis Tournament");
      expect(result.description).toBe("Weekly tennis event");
      expect(result.startTime).toBe("18:00");
      expect(result.endTime).toBe("20:00");
      expect(result.date).toBe(FIXED_DATE);
    });
  });

  describe("addEventTimeslot", () => {
    it("adds new timeslot to event", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      const originalTimeslotCount = insertedEvent.timeslots.length;

      const newTimeslot = createTestTimeslotInput({
        maxParticipants: 8,
        maxWaitlist: 3,
        permanentParticipants: [userId],
      });

      const result = await t.runWithCtx(async (ctx) => {
        return await addEventTimeslot(ctx, eventId, newTimeslot);
      });

      expect(result.timeslots).toHaveLength(originalTimeslotCount + 1);
      const addedTimeslot = result.timeslots[result.timeslots.length - 1];
      expect(addedTimeslot.id).toBeDefined();
      expect(addedTimeslot.numParticipants).toBe(1);
      expect(addedTimeslot.numWaitlisted).toBe(0);
      expect(addedTimeslot.maxParticipants).toBe(8);
    });

    it("updates modifiedAt timestamp", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      const originalModifiedAt = insertedEvent.modifiedAt!;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const newTimeslot = createTestTimeslotInput({
        duration: 30,
        maxParticipants: 4,
        maxWaitlist: 2,
      });

      const result = await t.runWithCtx(async (ctx) => {
        return await addEventTimeslot(ctx, eventId, newTimeslot);
      });

      expect(result.modifiedAt).toBeGreaterThan(originalModifiedAt);
    });
  });

  describe("updateEventTimeslot", () => {
    it("updates existing timeslot", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventData = createTestEvent(clubId, userId, FIXED_DATE, {
        timeslots: [createTestTimeslot({ maxParticipants: 10, maxWaitlist: 5 })],
      });
      const insertedEvent = await eventHelpers.insertEvent(eventData);
      const eventId = insertedEvent._id;
      const timeslotId = insertedEvent.timeslots[0].id;

      const updateData = {
        id: timeslotId,
        maxParticipants: 15,
        permanentParticipants: [userId],
      };

      const result = await t.runWithCtx(async (ctx) => {
        return await updateEventTimeslot(ctx, eventId, updateData);
      });

      const updatedTimeslot = result.timeslots.find((ts) => ts.id === timeslotId);
      expect(updatedTimeslot!.maxParticipants).toBe(15);
      expect(updatedTimeslot!.permanentParticipants).toEqual([userId]);
      expect(updatedTimeslot!.numParticipants).toBe(1);
    });

    it("recalculates participant counts with existing participants", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      const timeslotId = insertedEvent.timeslots[0].id;

      // Add participants
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, timeslotId, FIXED_DATE, {
          isWaitlisted: false,
        }),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, timeslotId, FIXED_DATE, {
          isWaitlisted: true,
        }),
      );

      const updateData = {
        id: timeslotId,
        permanentParticipants: [userId1],
      };

      const result = await t.runWithCtx(async (ctx) => {
        return await updateEventTimeslot(ctx, eventId, updateData);
      });

      const updatedTimeslot = result.timeslots.find((ts) => ts.id === timeslotId);
      expect(updatedTimeslot!.numParticipants).toBe(2); // 1 permanent + 1 active
      expect(updatedTimeslot!.numWaitlisted).toBe(1);
    });

    it("updates timeslot without permanentParticipants field", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );
      const eventId = insertedEvent._id;
      const timeslotId = insertedEvent.timeslots[0].id;

      // Add participants
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, timeslotId, FIXED_DATE, {
          isWaitlisted: false,
        }),
      );
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, timeslotId, FIXED_DATE, { isWaitlisted: true }),
      );

      const updateData = {
        id: timeslotId,
        startTime: "10:00",
        endTime: "11:00",
        // Note: permanentParticipants is undefined
      };

      const result = await t.runWithCtx(async (ctx) => {
        return await updateEventTimeslot(ctx, eventId, updateData);
      });

      expect(result.timeslots[0].startTime).toBe("10:00");
      expect(result.timeslots[0].endTime).toBe("11:00");
      expect(result.timeslots[0].numParticipants).toBe(1); // Only active participants
      expect(result.timeslots[0].numWaitlisted).toBe(1);
    });

    it("leaves other timeslots unchanged when updating specific timeslot", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const eventData = createTestEvent(clubId, userId, FIXED_DATE, {
        timeslots: [
          createTestTimeslot({ id: "slot-1", maxParticipants: 10 }),
          createTestTimeslot({ id: "slot-2", maxParticipants: 8 }),
        ],
      });
      const insertedEvent = await eventHelpers.insertEvent(eventData);
      const eventId = insertedEvent._id;

      const updateData = {
        id: "slot-1",
        maxParticipants: 15,
      };

      const result = await t.runWithCtx((ctx) => updateEventTimeslot(ctx, eventId, updateData));

      // First timeslot should be updated
      expect(result.timeslots[0].maxParticipants).toBe(15);
      // Second timeslot should remain unchanged (covers line 395)
      expect(result.timeslots[1].maxParticipants).toBe(8);
    });
  });

  describe("removeEventTimeslotWithParticipants", () => {
    it("removes timeslot and deletes participants", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      // Create event with multiple timeslots
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE),
      );

      // Add a second timeslot
      const eventWithSecondTimeslot = await t.runWithCtx(async (ctx) => {
        return await addEventTimeslot(
          ctx,
          insertedEvent._id,
          createTestTimeslotInput({ duration: 30, maxParticipants: 5, maxWaitlist: 2 }),
        );
      });

      const eventId = eventWithSecondTimeslot._id;
      const timeslotToRemove = eventWithSecondTimeslot.timeslots[0].id;
      const timeslotToKeep = eventWithSecondTimeslot.timeslots[1].id;

      // Add participants to both timeslots
      const participant1 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, timeslotToRemove, FIXED_DATE),
      );
      const participant2 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, timeslotToRemove, FIXED_DATE),
      );
      const participant3 = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, timeslotToKeep, FIXED_DATE),
      );

      const result = await t.runWithCtx(async (ctx) => {
        return await removeEventTimeslotWithParticipants(ctx, eventId, timeslotToRemove);
      });

      // Verify timeslot removed
      expect(result.timeslots).toHaveLength(1);
      expect(result.timeslots[0].id).toBe(timeslotToKeep);

      // Verify participants deleted
      const deletedParticipant1 = await eventHelpers.getEventParticipant(participant1._id);
      const deletedParticipant2 = await eventHelpers.getEventParticipant(participant2._id);
      const remainingParticipant = await eventHelpers.getEventParticipant(participant3._id);

      expect(deletedParticipant1).toBeNull();
      expect(deletedParticipant2).toBeNull();
      expect(remainingParticipant).not.toBeNull();
    });

    it("updates modifiedAt timestamp", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      // Create event with multiple timeslots
      const insertedEvent = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE),
      );

      // Add a second timeslot
      const eventWithSecondTimeslot = await t.runWithCtx(async (ctx) => {
        return await addEventTimeslot(
          ctx,
          insertedEvent._id,
          createTestTimeslotInput({ duration: 30, maxParticipants: 5, maxWaitlist: 2 }),
        );
      });

      const eventId = eventWithSecondTimeslot._id;
      const originalModifiedAt = eventWithSecondTimeslot.modifiedAt!;
      const timeslotToRemove = eventWithSecondTimeslot.timeslots[0].id;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await t.runWithCtx(async (ctx) => {
        return await removeEventTimeslotWithParticipants(ctx, eventId, timeslotToRemove);
      });

      expect(result.modifiedAt).toBeGreaterThan(originalModifiedAt);
    });
  });
});
