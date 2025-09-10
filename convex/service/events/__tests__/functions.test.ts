import { api, internal } from "@/convex/_generated/api";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR,
  EVENT_NOT_FOUND_ERROR,
  EVENT_SERIES_NOT_FOUND_ERROR,
} from "@/convex/constants/errors";
import { EVENT_STATUS, EVENT_VISIBILITY, FEE_TYPE } from "@/convex/constants/events";
import { TIME_MS } from "@/convex/constants/time";
import schema from "@/convex/schema";
import { convexTest } from "@/convex/setup.testing";
import { ActivityTestHelpers } from "@/test-utils/samples/activities";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventInput,
  createTestEventParticipant,
  createTestEventSeries,
  createTestEventSeriesInput,
  createTestTimeslot,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { addDays, addMinutes } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

// Fixed timestamp for consistent test data
const FIXED_DATE = Date.now() + 24 * 60 * 60 * 1000; // Tomorrow

describe("Events Functions", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let eventHelpers: EventTestHelpers;
  let activityHelpers: ActivityTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    eventHelpers = new EventTestHelpers(t);
    activityHelpers = new ActivityTestHelpers(t);
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // Wait for all scheduled functions to complete
    if (vi.isFakeTimers()) {
      await vi.runAllTimersAsync();
    }
    vi.useRealTimers();
  });

  describe("getEventSeries", () => {
    it("returns event series when user is club owner", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.getEventSeries, {
        eventSeriesId: seriesId,
      });

      expect(result._id).toBe(seriesId);
      expect(result.clubId).toBe(clubId);
    });

    it("throws error when event series not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      await eventHelpers.deleteEventSeries(seriesId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.events.functions.getEventSeries, { eventSeriesId: seriesId }),
      ).rejects.toThrow(EVENT_SERIES_NOT_FOUND_ERROR);
    });

    it("throws error when user lacks permissions", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, ownerId));
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.events.functions.getEventSeries, { eventSeriesId: seriesId }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("listClubEventSeries", () => {
    it("returns paginated event series for club owner", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.listClubEventSeries, {
        clubId,
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((s) => s.clubId === clubId)).toBe(true);
    });

    it("throws error when user lacks permissions", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.events.functions.listClubEventSeries, {
          clubId,
          pagination: { cursor: null, numItems: 10 },
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("getEvent", () => {
    it("returns event with participants when user is participant", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.getEvent, { eventId });

      expect(result._id).toBe(eventId);
      expect(result.participants).toHaveLength(1);
      expect(result.participants[0].userId).toBe(userId);
    });

    it("returns event when user has club access", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.getEvent, { eventId });

      expect(result._id).toBe(eventId);
      expect(result.participants).toHaveLength(0);
    });

    it("throws error when event not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      await eventHelpers.deleteEvent(eventId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.events.functions.getEvent, { eventId }),
      ).rejects.toThrow(EVENT_NOT_FOUND_ERROR);
    });
  });

  describe("listClubEvents", () => {
    it("returns events for club member", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId, { isApproved: true }),
      );
      await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE + 86400000));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.listClubEvents, {
        clubId,
        filters: { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 172800000 },
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((e) => e.clubId === clubId)).toBe(true);
    });

    it("throws error when user is not club member", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.events.functions.listClubEvents, {
          clubId,
          filters: { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 172800000 },
          pagination: { cursor: null, numItems: 10 },
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("listMyEvents", () => {
    it("returns events user is participating in", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, "timeslot-1", FIXED_DATE),
      );

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.listMyEvents, {
        filters: { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(eventId);
    });

    it("returns empty page when user has no participations", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.listMyEvents, {
        filters: { fromDate: FIXED_DATE - 86400000, toDate: FIXED_DATE + 86400000 },
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(0);
    });
  });

  describe("searchEvents", () => {
    it("returns events matching search criteria", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
      const clubId = club._id;
      await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId, { isApproved: true }),
      );
      await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE, { name: "Tennis Tournament" }),
      );
      await eventHelpers.insertEvent(
        createTestEvent(clubId, userId, FIXED_DATE, { name: "Basketball Game" }),
      );

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.events.functions.searchEvents, {
        filters: {
          fromDate: FIXED_DATE - 86400000,
          toDate: FIXED_DATE + 86400000,
          query: "tennis",
        },
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].name).toContain("Tennis");
    });
  });

  describe("createEventSeries", () => {
    it("creates event series when user is club owner", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const now = Date.now();
      const startDate = addMinutes(now, 30).getTime();
      const endDate = addDays(startDate, 30).getTime();
      const input = createTestEventSeriesInput(clubId, {
        isActive: false,
        schedule: {
          daysOfWeek: [1],
          interval: 1,
          startDate,
          endDate,
        },
      });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.createEventSeries, {
        input,
      });

      vi.advanceTimersByTime(31 * TIME_MS.MINUTE);

      expect(result.name).toBe(input.name);
      expect(result.clubId).toBe(clubId);
      expect(result.createdBy).toBe(userId);
      expect(result.isActive).toBe(false);

      vi.advanceTimersByTime(31 * TIME_MS.DAY);

      expect(result.isActive).toBe(false);
    });

    it("creates active event series with scheduling and deactivation", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const endDate = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const input = createTestEventSeriesInput(clubId, {
        isActive: true,
        schedule: {
          startDate: Date.now() + 1000,
          endDate,
          daysOfWeek: [1, 2, 3],
          interval: 1,
        },
      });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.createEventSeries, {
        input,
      });

      expect(result.isActive).toBe(true);

      // Advance to end date to trigger deactivation
      vi.advanceTimersByTime(endDate - Date.now() + 1000);
      vi.runAllTimers();
      await t.finishInProgressScheduledFunctions();

      // Verify series was deactivated
      const deactivatedSeries = await eventHelpers.getEventSeries(result._id);
      expect(deactivatedSeries?.isActive).toBe(false);
    });

    it("generates events when series is activated", async () => {
      vi.setSystemTime(1704067200000); // Monday 2024-01-01T00:00:00.000Z
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const input = createTestEventSeriesInput(clubId, {
        isActive: true,
        schedule: {
          startDate: Date.now() + TIME_MS.MINUTE,
          endDate: Date.now() + 90 * TIME_MS.DAY,
          daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
          interval: 1, // Weekly
        },
        location: {
          name: "utc",
          placeId: "utc",
          address: "utc",
          timezone: "UTC",
        },
      });

      const asUser = t.withIdentity({ subject: userId });
      const eventSeries = await asUser.mutation(api.service.events.functions.createEventSeries, {
        input,
      });
      const eventSeriesId = eventSeries._id;

      // Verify initial events are generated
      {
        const events = await eventHelpers.listEventsBySeries(eventSeriesId);
        expect(events.length).toBe(10);
        expect(events.every((e) => e.clubId === clubId)).toBe(true);
        expect(events.every((e) => e.eventSeriesId === eventSeriesId)).toBe(true);
        const eventDates = events.map((e) => new Date(e.date).getDay());
        expect(eventDates).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
      }

      // Verify next batch is generated automatically
      vi.advanceTimersByTime(9 * TIME_MS.DAY);
      vi.runAllTimers();
      await t.finishInProgressScheduledFunctions();

      {
        const events = await eventHelpers.listEventsBySeries(eventSeriesId);
        expect(events.length).toBe(20);
        const eventDates = events.map((e) => new Date(e.date).getDay());
        expect(eventDates).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
      }

      // Verify final batch generation
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      {
        const events = await eventHelpers.listEventsBySeries(eventSeriesId);
        // Should have generated events for the full series duration
        // 90 days ≈ 13 weeks × 5 weekdays = 65 events
        expect(events.length).toBe(65);
      }

      // Verify event series is deactivated at the end
      {
        const eventSeries = await eventHelpers.getEventSeries(eventSeriesId);
        expect(eventSeries?.isActive).toBe(false);
      }
    });

    it("creates activity log when event series is created", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const input = createTestEventSeriesInput(clubId);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.createEventSeries, {
        input,
      });

      const activities = await activityHelpers.listActivitiesForEventSeries(result._id);
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe(ACTIVITY_TYPES.EVENT_SERIES_CREATED);
    });

    it("throws error when user lacks permissions", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;
      const input = createTestEventSeriesInput(clubId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.createEventSeries, { input }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("deactivates series when updating isActive to false", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, { isActive: true }),
      );
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.updateEventSeries, {
        eventSeriesId: seriesId,
        input: { isActive: false },
      });

      expect(result.isActive).toBe(false);

      // Verify deactivation activity was created
      const activities = await activityHelpers.listActivitiesForEventSeries(seriesId);
      const activity = activities.find((a) => a.type === ACTIVITY_TYPES.EVENT_SERIES_UPDATED);
      expect(activity?.metadata).toEqual([
        { fieldChanged: "isActive", previousValue: "true", newValue: "false" },
      ]);
    });
  });

  describe("updateEventSeries", () => {
    it("updates event series when user is club owner", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const input = { name: "Updated Series Name" };

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.updateEventSeries, {
        eventSeriesId: seriesId,
        input,
      });

      expect(result.name).toBe("Updated Series Name");
    });

    it("activates event series and schedules deactivation", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const endDate = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days from now
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, {
          isActive: false,
          schedule: {
            startDate: Date.now() + 1000,
            endDate,
            daysOfWeek: [1, 2, 3],
            interval: 1,
          },
        }),
      );
      const seriesId = series._id;
      const input = { isActive: true };

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.updateEventSeries, {
        eventSeriesId: seriesId,
        input,
      });

      expect(result.isActive).toBe(true);

      // Advance to end date to trigger deactivation
      vi.advanceTimersByTime(endDate - Date.now() + 1000);
      vi.runAllTimers();
      await t.finishInProgressScheduledFunctions();

      // Verify series was deactivated
      const deactivatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(deactivatedSeries?.isActive).toBe(false);
    });

    it("creates activity log when event series is updated", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const input = { name: "Updated Series Name" };

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.events.functions.updateEventSeries, {
        eventSeriesId: seriesId,
        input,
      });

      const activities = await activityHelpers.listActivitiesForEventSeries(seriesId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_SERIES_UPDATED)).toBe(true);
    });

    it("throws error when user lacks permissions", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, ownerId));
      const seriesId = series._id;
      const input = { name: "Updated Series Name" };

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.updateEventSeries, {
          eventSeriesId: seriesId,
          input,
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("deleteEventSeries", () => {
    it("deletes event series when user is club owner", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.events.functions.deleteEventSeries, {
        eventSeriesId: seriesId,
      });

      const deletedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(deletedSeries).toBeNull();
    });

    it("creates activity log when event series is deleted", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.events.functions.deleteEventSeries, {
        eventSeriesId: seriesId,
      });

      const activities = await activityHelpers.listActivitiesForClub(clubId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_SERIES_DELETED)).toBe(true);
    });
  });

  describe("createEvent", () => {
    it("creates event when user is club owner", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const input = createTestEventInput(clubId, { date: FIXED_DATE });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.createEvent, { input });

      expect(result.name).toBe(input.name);
      expect(result.clubId).toBe(clubId);
      expect(result.date).toBe(FIXED_DATE);
      expect(result.status).toBe(EVENT_STATUS.NOT_STARTED);
    });

    it("creates activity log when event is created", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const input = createTestEventInput(clubId, { date: FIXED_DATE });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.createEvent, { input });

      const activities = await activityHelpers.listActivitiesForEvent(result._id);
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe(ACTIVITY_TYPES.EVENT_CREATED);
    });

    it("throws error when user lacks permissions", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;
      const input = createTestEventInput(clubId, { date: FIXED_DATE });

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.createEvent, { input }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("generateEvents", () => {
    it("generates events with status transitions scheduled", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, {
          isActive: true,
          startTime: "18:00",
          endTime: "20:00",
          location: {
            name: "Test Court",
            address: "123 Test St",
            placeId: "test-place",
            timezone: "UTC",
          },
        }),
      );
      const seriesId = series._id;
      const startDate = FIXED_DATE;
      const endDate = FIXED_DATE + 7 * 24 * 60 * 60 * 1000;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.generateEvents, {
        eventSeriesId: seriesId,
        startDate,
        endDate,
      });

      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.events.length).toBe(1);

      const event = result.events[0];
      expect(event.status).toBe(EVENT_STATUS.NOT_STARTED);

      // Advance to event start time
      const eventStartTime = event.date + 18 * 60 * 60 * 1000; // 6 PM on event date
      vi.advanceTimersByTime(eventStartTime - Date.now());
      await t.finishInProgressScheduledFunctions();

      // Verify event status changed to IN_PROGRESS
      const updatedEvent = await eventHelpers.getEvent(event._id);
      expect(updatedEvent?.status).toBe(EVENT_STATUS.IN_PROGRESS);

      // Advance to event end time
      const eventEndTime = event.date + 20 * 60 * 60 * 1000; // 8 PM on event date
      vi.advanceTimersByTime(eventEndTime - eventStartTime);
      vi.runAllTimers();
      await t.finishInProgressScheduledFunctions();

      // Verify event status changed to COMPLETED
      const completedEvent = await eventHelpers.getEvent(event._id);
      expect(completedEvent?.status).toBe(EVENT_STATUS.COMPLETED);
    });

    it("throws error when event series is inactive", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, { isActive: false }),
      );
      const seriesId = series._id;
      const startDate = FIXED_DATE;
      const endDate = FIXED_DATE + 7 * 24 * 60 * 60 * 1000;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.generateEvents, {
          eventSeriesId: seriesId,
          startDate,
          endDate,
        }),
      ).rejects.toThrow(EVENT_CANNOT_GENERATE_DUE_TO_INACTIVE_STATUS_ERROR);
    });

    it("throws error when user lacks permissions", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, ownerId, { isActive: true }),
      );
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.generateEvents, {
          eventSeriesId: seriesId,
          startDate: FIXED_DATE,
          endDate: FIXED_DATE + 7 * 24 * 60 * 60 * 1000,
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("generates events without scheduling next batch when not specified", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, { isActive: true }),
      );
      const seriesId = series._id;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.generateEvents, {
        eventSeriesId: seriesId,
        startDate: FIXED_DATE,
        endDate: FIXED_DATE + 7 * 24 * 60 * 60 * 1000,
      });

      expect(result.events).toBeDefined();

      // Verify no next batch function is scheduled
      const updatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(updatedSeries?.onNextBatchFunctionId).toBeUndefined();
    });
  });

  describe("joinEvent", () => {
    it("joins user to event timeslot", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.joinEvent, {
        eventId,
        timeslotId,
      });

      expect(result.eventId).toBe(eventId);
      expect(result.userId).toBe(userId);
      expect(result.timeslotId).toBe(timeslotId);
      expect(result.isWaitlisted).toBe(false);
      expect(result.date).toBe(FIXED_DATE);
    });

    it("returns existing participation if user already joined", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;
      const existingParticipation = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, timeslotId, FIXED_DATE),
      );

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.events.functions.joinEvent, {
        eventId,
        timeslotId,
      });

      expect(result._id).toBe(existingParticipation._id);
    });

    it("creates activity log when user joins event", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.events.functions.joinEvent, { eventId, timeslotId });

      const activities = await activityHelpers.listActivitiesForEvent(eventId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_JOINED)).toBe(true);
    });

    it("throws error when event not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      await eventHelpers.deleteEvent(eventId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.joinEvent, {
          eventId,
          timeslotId: "timeslot-1",
        }),
      ).rejects.toThrow(EVENT_NOT_FOUND_ERROR);
    });

    it("throws error when user lacks event access", async () => {
      const owner = await userHelpers.insertUser("owner@test.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));
      const user = await userHelpers.insertUser("user@test.com");
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(ownerId, { isPublic: false }));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(
        createTestEvent(clubId, ownerId, FIXED_DATE, { visibility: EVENT_VISIBILITY.MEMBERS_ONLY }),
      );
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.joinEvent, { eventId, timeslotId }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("leaveEvent", () => {
    it("removes user from event timeslot", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;
      const participation = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, timeslotId, FIXED_DATE),
      );

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.events.functions.leaveEvent, { eventId, timeslotId });

      const deletedParticipation = await eventHelpers.getEventParticipant(participation._id);
      expect(deletedParticipation).toBeNull();
    });

    it("does nothing when user is not participating", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.leaveEvent, { eventId, timeslotId }),
      ).resolves.not.toThrow();
    });

    it("creates activity log when user leaves event", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId, timeslotId, FIXED_DATE),
      );

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.events.functions.leaveEvent, { eventId, timeslotId });

      const activities = await activityHelpers.listActivitiesForEvent(eventId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_LEFT)).toBe(true);
    });

    it("throws error when event not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;
      await eventHelpers.deleteEvent(eventId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.events.functions.leaveEvent, {
          eventId,
          timeslotId: "timeslot-1",
        }),
      ).rejects.toThrow(EVENT_NOT_FOUND_ERROR);
    });

    it("promotes waitlisted participant when user leaves", async () => {
      const user1 = await userHelpers.insertUser("user1@test.com");
      const userId1 = user1._id;
      await userHelpers.insertProfile(createTestProfile(userId1));
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      await userHelpers.insertProfile(createTestProfile(userId2));
      const club = await clubHelpers.insertClub(createTestClub(userId1, { isPublic: true }));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(
        createTestEvent(clubId, userId1, FIXED_DATE, {
          timeslots: [
            createTestTimeslot({
              maxParticipants: 1,
              maxWaitlist: 5,
              feeType: FEE_TYPE.SPLIT,
            }),
          ],
        }),
      );
      const eventId = event._id;
      const timeslotId = event.timeslots[0].id;

      // Add active participant
      await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId1, timeslotId, FIXED_DATE, {
          isWaitlisted: false,
        }),
      );

      // Add waitlisted participant
      const waitlistedParticipant = await eventHelpers.insertEventParticipant(
        createTestEventParticipant(eventId, userId2, timeslotId, FIXED_DATE, {
          isWaitlisted: true,
        }),
      );

      // User1 leaves event
      const asUser1 = t.withIdentity({ subject: userId1 });
      await asUser1.mutation(api.service.events.functions.leaveEvent, { eventId, timeslotId });

      // Verify waitlisted participant was promoted
      const promotedParticipant = await eventHelpers.getEventParticipant(waitlistedParticipant._id);
      expect(promotedParticipant?.isWaitlisted).toBe(false);
    });
  });

  describe("internal functions", () => {
    it("updates event status to IN_PROGRESS and creates activity", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;

      const updatedEvent = await t.mutation(internal.service.events.functions._updateEventStatus, {
        eventId,
        status: EVENT_STATUS.IN_PROGRESS,
      });

      expect(updatedEvent.status).toBe(EVENT_STATUS.IN_PROGRESS);
      const activities = await activityHelpers.listActivitiesForEvent(eventId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_IN_PROGRESS)).toBe(true);
    });

    it("updates event status to COMPLETED", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;

      const updatedEvent = await t.mutation(internal.service.events.functions._updateEventStatus, {
        eventId,
        status: EVENT_STATUS.COMPLETED,
      });

      expect(updatedEvent.status).toBe(EVENT_STATUS.COMPLETED);
      const activities = await activityHelpers.listActivitiesForEvent(eventId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_COMPLETED)).toBe(true);
    });

    it("updates event status to CANCELLED", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, FIXED_DATE));
      const eventId = event._id;

      const updatedEvent = await t.mutation(internal.service.events.functions._updateEventStatus, {
        eventId,
        status: EVENT_STATUS.CANCELLED,
      });

      expect(updatedEvent.status).toBe(EVENT_STATUS.CANCELLED);
      // Should not create activity for cancelled status
      const activities = await activityHelpers.listActivitiesForEvent(eventId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_CANCELLED)).toBe(true);
    });

    it("deactivates event series and cancels pending next batch function", async () => {
      vi.useFakeTimers();

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, { isActive: true }),
      );
      const seriesId = series._id;

      // Schedule a next batch function
      await t.runWithCtx(async (ctx) => {
        const functionId = await ctx.scheduler.runAt(
          Date.now() + 86400000,
          internal.service.events.functions._generateEventsForSeries,
          {
            eventSeriesId: seriesId,
            range: { startDate: Date.now(), endDate: Date.now() + 86400000 },
            scheduleNextBatch: true,
          },
        );
        await ctx.table("eventSeries").getX(seriesId).patch({ onNextBatchFunctionId: functionId });
      });

      const deactivatedSeries = await t.mutation(
        internal.service.events.functions._deactivateEventSeries,
        { eventSeriesId: seriesId },
      );

      expect(deactivatedSeries.isActive).toBe(false);
      const activities = await activityHelpers.listActivitiesForEventSeries(seriesId);
      expect(activities.some((a) => a.type === ACTIVITY_TYPES.EVENT_SERIES_DEACTIVATED)).toBe(true);

      vi.useRealTimers();
    });

    it("generates events for series with permanent participants and scheduling", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1704067200000); // Monday 2024-01-01

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(
        createTestEventSeries(clubId, userId, {
          isActive: true,
          startTime: "18:00",
          endTime: "20:00",
          timeslots: [
            {
              type: "duration",
              duration: 120,
              feeType: "split",
              maxParticipants: 10,
              maxWaitlist: 5,
              permanentParticipants: [userId],
            },
          ],
          location: {
            name: "Test Court",
            address: "123 Test St",
            placeId: "test-place",
            timezone: "UTC",
          },
        }),
      );
      const seriesId = series._id;

      const result = await t.mutation(internal.service.events.functions._generateEventsForSeries, {
        eventSeriesId: seriesId,
        range: {
          startDate: Date.now(),
          endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        },
        scheduleNextBatch: true,
      });

      expect(result.events.length).toBeGreaterThan(0);

      // Verify permanent participants were created
      const firstEvent = result.events[0];
      const participants = await t.runWithCtx(async (ctx) => {
        return await ctx.table("events").getX(firstEvent._id).edge("participants");
      });
      expect(participants.some((p) => p.userId === userId)).toBe(true);

      // Verify next batch was scheduled
      const updatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(updatedSeries?.onNextBatchFunctionId).toBeDefined();

      vi.useRealTimers();
    });
  });
});
