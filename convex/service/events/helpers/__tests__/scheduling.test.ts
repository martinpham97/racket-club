import { EVENT_STATUS, MAX_EVENT_GENERATION_DAYS } from "@/convex/constants/events";
import schema from "@/convex/schema";
import * as timeUtils from "@/convex/service/utils/time";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventSeries,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { SchedulerTestHelpers } from "@/test-utils/samples/scheduler";
import { UserTestHelpers } from "@/test-utils/samples/users";

import {
  activateEventSeries,
  getEventScheduleStatuses,
  getEventSeriesDeactivationStatus,
  getOrScheduleEventStatusTransitions,
  scheduleEventSeriesDeactivation,
  scheduleEventSeriesDeactivationAtEndDate,
  scheduleEventStatusTransitions,
  scheduleNextEventGeneration,
} from "@/convex/service/events/helpers/scheduling";
import { convexTest } from "@/convex/setup.testing";
import { addDays, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/time");

const mockGetStartOfDayInTimezone = vi.mocked(timeUtils.getStartOfDayInTimezone);
const mockGetUtcTimestampForDate = vi.mocked(timeUtils.getUtcTimestampForDate);

describe("Event Scheduling Helpers", () => {
  let t: ReturnType<typeof convexTest>;
  let clubHelpers: ClubTestHelpers;
  let userHelpers: UserTestHelpers;
  let eventHelpers: EventTestHelpers;
  let schedulerHelpers: SchedulerTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    eventHelpers = new EventTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    userHelpers = new UserTestHelpers(t);
    schedulerHelpers = new SchedulerTestHelpers(t);
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // Wait for all scheduled functions to complete
    if (vi.isFakeTimers()) {
      await vi.runAllTimersAsync();
    }
    vi.useRealTimers();
  });

  describe("scheduleEventSeriesDeactivation", () => {
    it("should schedule deactivation when no existing schedule", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const scheduledAt = Date.now() + 86400000;

      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivation(ctx, seriesId, scheduledAt);
      });

      // Wait for any async operations to complete
      await vi.runAllTimersAsync();

      // Verify scheduled function was created by checking edges
      const updatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(updatedSeries?.onSeriesEndFunctionId).toBeDefined();
      const scheduledFunction = await schedulerHelpers.getScheduledFunction(
        updatedSeries!.onSeriesEndFunctionId!,
      );
      expect(scheduledFunction).not.toBeNull();
      expect(scheduledFunction!.scheduledTime).toBe(scheduledAt);
      expect(scheduledFunction!.args).toEqual([{ eventSeriesId: seriesId }]);
      expect(scheduledFunction!.name).toBe("service/events/functions:_deactivateEventSeries");
    });

    it("should not schedule when existing schedule exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      // First schedule
      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivation(ctx, seriesId, Date.now());
      });

      // Second attempt should not schedule
      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivation(ctx, seriesId, Date.now());
      });

      // Verify only one scheduled function exists
      const updatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(updatedSeries?.onSeriesEndFunctionId).toBeDefined();
    });
  });

  describe("scheduleEventStatusTransitions", () => {
    it("should schedule both start and completion transitions", async () => {
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
      const startTime = Date.now() + 1000;
      const endTime = Date.now() + 2000;

      await t.runWithCtx(async (ctx) => {
        await scheduleEventStatusTransitions(ctx, eventId, startTime, endTime);
      });

      // Wait for any async operations to complete
      await vi.runAllTimersAsync();

      // Verify scheduled functions were created by checking edges
      const updatedEvent = await eventHelpers.getEvent(eventId);
      expect(updatedEvent?.onEventStartFunctionId).toBeDefined();
      expect(updatedEvent?.onEventEndFunctionId).toBeDefined();
      const startFunction = await schedulerHelpers.getScheduledFunction(
        updatedEvent!.onEventStartFunctionId!,
      );
      const endFunction = await schedulerHelpers.getScheduledFunction(
        updatedEvent!.onEventEndFunctionId!,
      );
      expect(startFunction).not.toBeNull();
      expect(endFunction).not.toBeNull();
      expect(startFunction!.scheduledTime).toBe(startTime);
      expect(startFunction!.args).toEqual([{ eventId, status: EVENT_STATUS.IN_PROGRESS }]);
      expect(startFunction!.name).toBe("service/events/functions:_updateEventStatus");
      expect(endFunction!.scheduledTime).toBe(endTime);
      expect(endFunction!.args).toEqual([{ eventId, status: EVENT_STATUS.COMPLETED }]);
      expect(endFunction!.name).toBe("service/events/functions:_updateEventStatus");
    });
  });

  describe("getOrScheduleEventStatusTransitions", () => {
    it("should schedule both start and end transitions", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const eventDate = Date.now();
      const startTime = eventDate + 1000;
      const endTime = eventDate + 2000;
      const event = await eventHelpers.insertEvent(
        createTestEvent(seriesId, clubId, userId, eventDate),
      );
      const eventId = event._id;

      mockGetUtcTimestampForDate.mockReturnValueOnce(startTime).mockReturnValueOnce(endTime);

      await t.runWithCtx(async (ctx) => {
        await getOrScheduleEventStatusTransitions(ctx, series, eventId, eventDate);
      });

      // Wait for any async operations to complete
      await vi.runAllTimersAsync();

      // Verify scheduled functions were created
      const updatedEvent = await eventHelpers.getEvent(eventId);
      expect(updatedEvent?.onEventStartFunctionId).toBeDefined();
      expect(updatedEvent?.onEventEndFunctionId).toBeDefined();
      const startFunction = await schedulerHelpers.getScheduledFunction(
        updatedEvent!.onEventStartFunctionId!,
      );
      const endFunction = await schedulerHelpers.getScheduledFunction(
        updatedEvent!.onEventEndFunctionId!,
      );
      expect(startFunction).not.toBeNull();
      expect(endFunction).not.toBeNull();
      expect(startFunction!.scheduledTime).toBe(startTime);
      expect(startFunction!.args).toEqual([{ eventId, status: EVENT_STATUS.IN_PROGRESS }]);
      expect(startFunction!.name).toBe("service/events/functions:_updateEventStatus");
      expect(endFunction!.scheduledTime).toBe(endTime);
      expect(endFunction!.args).toEqual([{ eventId, status: EVENT_STATUS.COMPLETED }]);
      expect(endFunction!.name).toBe("service/events/functions:_updateEventStatus");

      expect(mockGetUtcTimestampForDate).toHaveBeenCalledTimes(2);
    });
  });

  describe("scheduleEventSeriesDeactivationAtEndDate", () => {
    it("should schedule deactivation at series end date", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;
      const endDate = new Date("2024-12-31");

      mockGetStartOfDayInTimezone.mockReturnValue(endDate);

      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivationAtEndDate(ctx, seriesId, series);
      });

      // Wait for any async operations to complete
      await vi.runAllTimersAsync();

      // Verify scheduled function was created
      const updatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(updatedSeries?.onSeriesEndFunctionId).toBeDefined();
      const scheduledFunction = await schedulerHelpers.getScheduledFunction(
        updatedSeries!.onSeriesEndFunctionId!,
      );
      expect(scheduledFunction).not.toBeNull();
      expect(scheduledFunction!.scheduledTime).toBe(endDate.getTime());
      expect(scheduledFunction!.args).toEqual([{ eventSeriesId: seriesId }]);
      expect(scheduledFunction!.name).toBe("service/events/functions:_deactivateEventSeries");

      expect(mockGetStartOfDayInTimezone).toHaveBeenCalledWith(
        series.schedule.endDate,
        series.location.timezone,
      );
    });
  });

  describe("activateEventSeries", () => {
    it("should activate event series by scheduling deactivation and generating events", async () => {
      const now = Date.now();
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: now,
          endDate: addDays(now, 30).getTime(),
          daysOfWeek: [1, 2, 3],
          interval: 1,
        },
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const seriesId = insertedSeries._id;
      const series = await eventHelpers.getEventSeries(seriesId);

      mockGetStartOfDayInTimezone.mockReturnValue(new Date(seriesInput.schedule.endDate));

      await t.runWithCtx(async (ctx) => {
        const mockRunMutation = vi.fn().mockResolvedValue({
          events: [
            createTestEvent(seriesId, clubId, userId, now),
            createTestEvent(seriesId, clubId, userId, addDays(now, 7).getTime()),
          ],
        });
        ctx.runMutation = mockRunMutation as typeof ctx.runMutation;

        await activateEventSeries(ctx, series!);

        // Verify scheduled function was created
        const seriesWithEdges = await ctx.table("eventSeries").getX(seriesId);
        const scheduledFunction = await seriesWithEdges.edge("onSeriesEndFunction");
        expect(scheduledFunction).not.toBeNull();
        expect(scheduledFunction!.args).toEqual([{ eventSeriesId: seriesId }]);
        expect(scheduledFunction!.name).toBe("service/events/functions:_deactivateEventSeries");

        const actualCall = mockRunMutation.mock.calls[0][1];
        expect(actualCall.eventSeriesId).toBe(seriesId);
        expect(Math.floor(actualCall.range.startDate / 1000)).toBe(
          Math.floor(seriesInput.schedule.startDate / 1000),
        );
        expect(Math.floor(actualCall.range.endDate / 1000)).toBe(
          Math.floor(seriesInput.schedule.endDate / 1000),
        );
      });
    });
  });

  describe("scheduleNextEventGeneration", () => {
    it("should return early when no dates provided", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      await t.runWithCtx(async (ctx) => {
        await scheduleNextEventGeneration(ctx, seriesId, []);
      });
    });

    it("should schedule next generation when conditions are met", async () => {
      const now = Date.now();
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: now,
          endDate: addDays(now, 60).getTime(),
          daysOfWeek: [1, 2, 3],
          interval: 1,
        },
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const seriesId = insertedSeries._id;

      const currentDates = [now, addDays(now, 7).getTime()];
      const scheduleDate = subDays(addDays(now, 7).getTime(), MAX_EVENT_GENERATION_DAYS).getTime();

      vi.useFakeTimers();
      vi.setSystemTime(scheduleDate - 1000);

      await t.runWithCtx(async (ctx) => {
        await scheduleNextEventGeneration(ctx, seriesId, currentDates);
      });

      // Wait for any async operations to complete
      await vi.runAllTimersAsync();

      // Verify scheduled function was created in database
      const generationFunctions = await schedulerHelpers.getScheduledFunctionsByName(
        "service/events/functions:_generateEventsForSeries",
      );
      const generationFunction = generationFunctions[0];

      expect(generationFunction).toBeDefined();
      expect(generationFunction!.scheduledTime).toBe(scheduleDate);
      expect(generationFunction!.args).toEqual([
        {
          eventSeriesId: seriesId,
          range: {
            startDate: addDays(addDays(now, 7).getTime(), 1).getTime(),
            endDate: seriesInput.schedule.endDate,
          },
        },
      ]);
    });

    it("should not schedule when schedule date is in the past", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId);
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const seriesId = insertedSeries._id;
      const currentDates = [Date.now() - 1000];

      const initialFunctions = await schedulerHelpers.getAllScheduledFunctions();

      await t.runWithCtx(async (ctx) => {
        await scheduleNextEventGeneration(ctx, seriesId, currentDates);
      });

      const finalFunctions = await schedulerHelpers.getAllScheduledFunctions();
      expect(finalFunctions.length).toBe(initialFunctions.length);
    });
  });

  describe("getEventSeriesDeactivationStatus", () => {
    it("should return schedule status when exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      // Schedule deactivation first
      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivation(ctx, seriesId, Date.now());
      });

      const status = await t.runWithCtx(async (ctx) => {
        return await getEventSeriesDeactivationStatus(ctx, seriesId);
      });

      expect(status).toBeDefined();
      expect(status).toBe("pending");
    });

    it("should return null when no schedule exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const status = await t.runWithCtx(async (ctx) => {
        return await getEventSeriesDeactivationStatus(ctx, seriesId);
      });

      expect(status).toBeNull();
    });
  });

  describe("getEventScheduleStatuses", () => {
    it("should return schedule statuses when they exist", async () => {
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

      // Schedule transitions first
      await t.runWithCtx(async (ctx) => {
        await scheduleEventStatusTransitions(ctx, eventId, Date.now(), Date.now() + 1000);
      });

      const statuses = await t.runWithCtx(async (ctx) => {
        return await getEventScheduleStatuses(ctx, eventId);
      });

      expect(statuses).toHaveProperty("onEventStart");
      expect(statuses).toHaveProperty("onEventEnd");
      expect(statuses.onEventStart).toBe("pending");
      expect(statuses.onEventEnd).toBe("pending");
    });

    it("should return null statuses when no schedules exist", async () => {
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

      const statuses = await t.runWithCtx(async (ctx) => {
        return await getEventScheduleStatuses(ctx, eventId);
      });

      expect(statuses.onEventStart).toBeNull();
      expect(statuses.onEventEnd).toBeNull();
    });
  });

  describe("Automatic cancellation on deletion", () => {
    it("should cancel scheduled functions when event is deleted", async () => {
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

      // Schedule transitions
      await t.runWithCtx(async (ctx) => {
        await scheduleEventStatusTransitions(ctx, eventId, Date.now() + 1000, Date.now() + 2000);
      });

      // Verify functions exist
      const eventWithEdges = await eventHelpers.getEvent(eventId);
      expect(eventWithEdges).not.toBeNull();
      const startFunctionId = eventWithEdges!.onEventStartFunctionId;
      const endFunctionId = eventWithEdges!.onEventEndFunctionId;
      expect(startFunctionId).toBeDefined();
      expect(endFunctionId).toBeDefined();
      const startFunctionBefore = await schedulerHelpers.getScheduledFunction(startFunctionId!);
      expect(startFunctionBefore?.state.kind).toBe("pending");
      const endFunctionBefore = await schedulerHelpers.getScheduledFunction(endFunctionId!);
      expect(endFunctionBefore?.state.kind).toBe("pending");

      // Delete event
      await t.runWithCtx(async (ctx) => {
        await ctx.table("events").getX(eventId).delete();
      });

      // Verify scheduled functions are cancelled
      const startFunction = await schedulerHelpers.getScheduledFunction(startFunctionId!);
      const endFunction = await schedulerHelpers.getScheduledFunction(endFunctionId!);
      expect(startFunction?.state.kind).toBe("canceled");
      expect(endFunction?.state.kind).toBe("canceled");
    });

    it("should cancel scheduled functions when event series is deleted", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      // Schedule deactivation
      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivation(ctx, seriesId, Date.now() + 86400000);
      });

      // Verify function exists
      const seriesWithEdges = await eventHelpers.getEventSeries(seriesId);
      expect(seriesWithEdges).not.toBeNull();
      const functionId = seriesWithEdges!.onSeriesEndFunctionId;
      expect(functionId).toBeDefined();
      const scheduledFunctionBefore = await schedulerHelpers.getScheduledFunction(functionId!);
      expect(scheduledFunctionBefore?.state.kind).toBe("pending");

      // Delete event series
      await t.runWithCtx(async (ctx) => {
        await ctx.table("eventSeries").getX(seriesId).delete();
      });

      // Verify scheduled function is cancelled
      const scheduledFunction = await schedulerHelpers.getScheduledFunction(functionId!);
      expect(scheduledFunction?.state.kind).toBe("canceled");
    });
  });
});
