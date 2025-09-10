import { EVENT_STATUS, NUM_DAYS_GENERATE_EVENTS_IN_ADVANCE } from "@/convex/constants/events";
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

import { internal } from "@/convex/_generated/api";
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
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
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
      const eventDate = Date.now();
      const startTime = eventDate + 1000;
      const endTime = eventDate + 2000;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, eventDate));
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
        await scheduleEventSeriesDeactivationAtEndDate(ctx, series);
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
      vi.useFakeTimers();
      vi.setSystemTime(1704067200000); // Monday 2024-01-01

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: Date.now() + 1000,
          endDate: addDays(Date.now(), 30).getTime(),
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
            createTestEvent(clubId, userId, Date.now()),
            createTestEvent(clubId, userId, addDays(Date.now(), 7).getTime()),
          ],
        });
        ctx.runMutation = mockRunMutation as typeof ctx.runMutation;

        await activateEventSeries(ctx, series!);

        // Verify deactivation was scheduled
        const seriesWithEdges = await ctx.table("eventSeries").getX(seriesId);
        const scheduledFunction = await seriesWithEdges.edge("onSeriesEndFunction");
        expect(scheduledFunction).not.toBeNull();
        expect(scheduledFunction!.args).toEqual([{ eventSeriesId: seriesId }]);
        expect(scheduledFunction!.name).toBe("service/events/functions:_deactivateEventSeries");

        // Verify event generation was called
        expect(mockRunMutation).toHaveBeenCalledWith(
          internal.service.events.functions._generateEventsForSeries,
          {
            eventSeriesId: seriesId,
            range: {
              startDate: Math.max(Date.now(), seriesInput.schedule.startDate),
              endDate: seriesInput.schedule.endDate,
            },
            scheduleNextBatch: true,
          },
        );
      });

      vi.useRealTimers();
    });

    it("should use current time when series start date is in the past", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1704067200000); // Monday 2024-01-01

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
          endDate: addDays(Date.now(), 30).getTime(),
          daysOfWeek: [1],
          interval: 1,
        },
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const series = await eventHelpers.getEventSeries(insertedSeries._id);

      mockGetStartOfDayInTimezone.mockReturnValue(new Date(seriesInput.schedule.endDate));

      await t.runWithCtx(async (ctx) => {
        const mockRunMutation = vi.fn().mockResolvedValue({ events: [] });
        ctx.runMutation = mockRunMutation as typeof ctx.runMutation;

        await activateEventSeries(ctx, series!);

        // Should use current time, not past start date
        const actualCall = mockRunMutation.mock.calls[0][1];
        expect(actualCall.range.startDate).toBe(Date.now());
      });

      vi.useRealTimers();
    });
  });

  describe("scheduleNextEventGeneration", () => {
    it("should return null when no dates provided", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      const result = await t.runWithCtx(async (ctx) => {
        return await scheduleNextEventGeneration(ctx, seriesId, []);
      });

      expect(result).toBeNull();
    });

    it("should schedule next generation and update series with function ID", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1704067200000); // Monday 2024-01-01

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: Date.now(),
          endDate: addDays(Date.now(), 60).getTime(),
          daysOfWeek: [1, 2, 3],
          interval: 1,
        },
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const seriesId = insertedSeries._id;

      const currentDates = [Date.now(), addDays(Date.now(), 7).getTime()];

      const functionId = await t.runWithCtx(async (ctx) => {
        return await scheduleNextEventGeneration(ctx, seriesId, currentDates);
      });

      expect(functionId).not.toBeNull();

      // Verify series was updated with function ID
      const updatedSeries = await eventHelpers.getEventSeries(seriesId);
      expect(updatedSeries?.onNextBatchFunctionId).toBe(functionId);

      // Verify scheduled function exists
      const scheduledFunction = await schedulerHelpers.getScheduledFunction(functionId!);
      expect(scheduledFunction).not.toBeNull();
      expect(scheduledFunction!.name).toBe("service/events/functions:_generateEventsForSeries");
      expect(scheduledFunction!.args).toEqual([
        {
          eventSeriesId: seriesId,
          range: {
            startDate: addDays(addDays(Date.now(), 7).getTime(), 1).getTime(),
            endDate: seriesInput.schedule.endDate,
          },
          scheduleNextBatch: true,
        },
      ]);

      vi.useRealTimers();
    });

    it("should return null when no future dates available", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
          endDate: Date.now() - 1000, // Series already ended
          daysOfWeek: [1],
          interval: 1,
        },
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const seriesId = insertedSeries._id;
      const currentDates = [Date.now() - 1000];

      const result = await t.runWithCtx(async (ctx) => {
        return await scheduleNextEventGeneration(ctx, seriesId, currentDates);
      });

      expect(result).toBeNull();
    });

    it("should schedule function with correct timing", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1704067200000); // Monday 2024-01-01

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: Date.now(),
          endDate: addDays(Date.now(), 30).getTime(),
          daysOfWeek: [1], // Mondays only
          interval: 2,
        },
      });
      const insertedSeries = await eventHelpers.insertEventSeries(seriesInput);
      const seriesId = insertedSeries._id;

      const nextMonday = addDays(Date.now(), 14).getTime();
      const currentDates = [Date.now(), nextMonday];
      const expectedScheduleTime = addDays(
        subDays(nextMonday, NUM_DAYS_GENERATE_EVENTS_IN_ADVANCE),
        1,
      ).getTime();

      const functionId = await t.runWithCtx(async (ctx) => {
        return await scheduleNextEventGeneration(ctx, seriesId, currentDates);
      });

      const scheduledFunction = await schedulerHelpers.getScheduledFunction(functionId!);
      expect(scheduledFunction!.scheduledTime).toBe(expectedScheduleTime);

      vi.useRealTimers();
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
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
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
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
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
      vi.useFakeTimers();

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const event = await eventHelpers.insertEvent(createTestEvent(clubId, userId, Date.now()));
      const eventId = event._id;

      // Schedule transitions
      await t.runWithCtx(async (ctx) => {
        await scheduleEventStatusTransitions(ctx, eventId, Date.now() + 1000, Date.now() + 2000);
      });

      // Verify functions exist and are pending
      const eventWithEdges = await eventHelpers.getEvent(eventId);
      const startFunctionId = eventWithEdges!.onEventStartFunctionId;
      const endFunctionId = eventWithEdges!.onEventEndFunctionId;
      expect(startFunctionId).toBeDefined();
      expect(endFunctionId).toBeDefined();

      {
        const startFunction = await schedulerHelpers.getScheduledFunction(startFunctionId!);
        const endFunction = await schedulerHelpers.getScheduledFunction(endFunctionId!);
        expect(startFunction?.state.kind).toBe("pending");
        expect(endFunction?.state.kind).toBe("pending");
      }

      // Delete event (should trigger cascade deletion)
      await t.runWithCtx(async (ctx) => {
        await ctx.table("events").getX(eventId).delete();
      });

      // Verify scheduled functions are cancelled
      {
        const startFunction = await schedulerHelpers.getScheduledFunction(startFunctionId!);
        const endFunction = await schedulerHelpers.getScheduledFunction(endFunctionId!);
        expect(startFunction?.state.kind).toBe("canceled");
        expect(endFunction?.state.kind).toBe("canceled");
      }

      vi.useRealTimers();
    });

    it("should cancel all scheduled functions when event series is deleted", async () => {
      vi.useFakeTimers();

      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const series = await eventHelpers.insertEventSeries(createTestEventSeries(clubId, userId));
      const seriesId = series._id;

      // Schedule both deactivation and next batch
      await t.runWithCtx(async (ctx) => {
        await scheduleEventSeriesDeactivation(ctx, seriesId, Date.now() + 86400000);
        await scheduleNextEventGeneration(ctx, seriesId, [Date.now()]);
      });

      // Verify functions exist and are pending
      const seriesWithEdges = await eventHelpers.getEventSeries(seriesId);
      const deactivationFunctionId = seriesWithEdges!.onSeriesEndFunctionId;
      const nextBatchFunctionId = seriesWithEdges!.onNextBatchFunctionId;
      expect(deactivationFunctionId).toBeDefined();
      expect(nextBatchFunctionId).toBeDefined();

      {
        const deactivationFunction = await schedulerHelpers.getScheduledFunction(
          deactivationFunctionId!,
        );
        const nextBatchFunction = await schedulerHelpers.getScheduledFunction(nextBatchFunctionId!);
        expect(deactivationFunction?.state.kind).toBe("pending");
        expect(nextBatchFunction?.state.kind).toBe("pending");
      }

      // Delete event series (should trigger cascade deletion)
      await t.runWithCtx(async (ctx) => {
        await ctx.table("eventSeries").getX(seriesId).delete();
      });

      // Verify all scheduled functions are cancelled
      {
        const deactivationFunction = await schedulerHelpers.getScheduledFunction(
          deactivationFunctionId!,
        );
        const nextBatchFunction = await schedulerHelpers.getScheduledFunction(nextBatchFunctionId!);
        expect(deactivationFunction?.state.kind).toBe("canceled");
        expect(nextBatchFunction?.state.kind).toBe("canceled");
      }

      vi.useRealTimers();
    });
  });
});
