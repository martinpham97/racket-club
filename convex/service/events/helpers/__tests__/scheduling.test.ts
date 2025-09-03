import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES, ActivityType } from "@/convex/constants/activities";
import { MAX_EVENT_GENERATION_DAYS } from "@/convex/constants/events";
import schema from "@/convex/schema";
import * as activitiesDatabase from "@/convex/service/activities/database";
import * as timeUtils from "@/convex/service/utils/time";
import { createTestActivityRecord } from "@/test-utils/samples/activities";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import {
  createTestEventRecord,
  createTestEventSeries,
  createTestEventSeriesRecord,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { genId } from "@/test-utils/samples/id";
import { createTestUserRecord, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { addDays, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateEventSeries,
  getOrCreateEventScheduledTransitionActivity,
  getOrScheduleEventStatusTransitions,
  scheduleEventSeriesDeactivation,
  scheduleNextEventGeneration,
} from "../scheduling";

vi.mock("@/convex/service/activities/database");
vi.mock("@/convex/service/utils/time");

const mockGetScheduledActivityForResource = vi.mocked(
  activitiesDatabase.getScheduledActivityForResource,
);
const mockCreateActivity = vi.mocked(activitiesDatabase.createActivity);
const mockGetStartOfDayInTimezone = vi.mocked(timeUtils.getStartOfDayInTimezone);
const mockGetUtcTimestampForDate = vi.mocked(timeUtils.getUtcTimestampForDate);

describe("Event Scheduling Helpers", () => {
  const t = convexTest(schema);
  const eventHelpers = new EventTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);
  const clubHelpers = new ClubTestHelpers(t);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getOrCreateEventScheduledTransitionActivity", () => {
    it("should return existing activity ID when activity already exists", async () => {
      const existingActivity = createTestActivityRecord();
      mockGetScheduledActivityForResource.mockResolvedValue(existingActivity);

      const result = await t.run(async (ctx) => {
        return await getOrCreateEventScheduledTransitionActivity(
          ctx,
          ACTIVITY_TYPES.EVENT_IN_PROGRESS_SCHEDULED,
          "event123" as Id<"events">,
          Date.now(),
        );
      });

      expect(result).toBe(existingActivity._id);
      expect(mockCreateActivity).not.toHaveBeenCalled();
    });

    it("should create new activity for event series deactivation", async () => {
      mockGetScheduledActivityForResource.mockResolvedValue(null);
      const newActivityId = genId<"activities">("activities");
      mockCreateActivity.mockResolvedValue(newActivityId);

      const result = await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn().mockResolvedValue("scheduledFunction123" as Id<"_scheduled_functions">),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        return await getOrCreateEventScheduledTransitionActivity(
          ctx,
          ACTIVITY_TYPES.EVENT_SERIES_DEACTIVATION_SCHEDULED,
          "series123" as Id<"eventSeries">,
          Date.now(),
        );
      });

      expect(result).toBe(newActivityId);
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: ACTIVITY_TYPES.EVENT_SERIES_DEACTIVATION_SCHEDULED,
          resourceId: "series123",
          metadata: [{ fieldChanged: "isActive", newValue: "false" }],
        }),
      );
    });

    it("should create new activity for event in progress", async () => {
      mockGetScheduledActivityForResource.mockResolvedValue(null);
      const newActivityId = genId<"activities">("activities");
      mockCreateActivity.mockResolvedValue(newActivityId);

      const result = await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn().mockResolvedValue("scheduledFunction123" as Id<"_scheduled_functions">),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        return await getOrCreateEventScheduledTransitionActivity(
          ctx,
          ACTIVITY_TYPES.EVENT_IN_PROGRESS_SCHEDULED,
          "event123" as Id<"events">,
          Date.now(),
        );
      });

      expect(result).toBe(newActivityId);
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: ACTIVITY_TYPES.EVENT_IN_PROGRESS_SCHEDULED,
          resourceId: "event123",
          metadata: [{ fieldChanged: "status", newValue: "in_progress" }],
        }),
      );
    });

    it("should create new activity for event completed", async () => {
      mockGetScheduledActivityForResource.mockResolvedValue(null);
      const newActivityId = genId<"activities">("activities");
      mockCreateActivity.mockResolvedValue(newActivityId);

      const result = await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn().mockResolvedValue("scheduledFunction123" as Id<"_scheduled_functions">),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        return await getOrCreateEventScheduledTransitionActivity(
          ctx,
          ACTIVITY_TYPES.EVENT_COMPLETED_SCHEDULED,
          "event123" as Id<"events">,
          Date.now(),
        );
      });

      expect(result).toBe(newActivityId);
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: ACTIVITY_TYPES.EVENT_COMPLETED_SCHEDULED,
          resourceId: "event123",
          metadata: [{ fieldChanged: "status", newValue: "completed" }],
        }),
      );
    });

    it("should return null for unknown activity type", async () => {
      mockGetScheduledActivityForResource.mockResolvedValue(null);

      const result = await t.run(async (ctx) => {
        return await getOrCreateEventScheduledTransitionActivity(
          ctx,
          "UNKNOWN_TYPE" as ActivityType,
          "event123" as Id<"events">,
          Date.now(),
        );
      });

      expect(result).toBeNull();
    });
  });

  describe("getOrScheduleEventStatusTransitions", () => {
    it("should schedule both start and end transitions", async () => {
      const user = createTestUserRecord();
      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id);
      const eventDate = Date.now();
      const startTime = eventDate + 1000;
      const endTime = eventDate + 2000;

      mockGetUtcTimestampForDate.mockReturnValueOnce(startTime).mockReturnValueOnce(endTime);
      mockGetScheduledActivityForResource.mockResolvedValue(null);
      mockCreateActivity.mockResolvedValue("activity123" as Id<"activities">);

      await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn().mockResolvedValue("scheduledFunction123" as Id<"_scheduled_functions">),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        await getOrScheduleEventStatusTransitions(
          ctx,
          series,
          "event123" as Id<"events">,
          eventDate,
        );
      });

      expect(mockGetUtcTimestampForDate).toHaveBeenCalledTimes(2);
      expect(mockCreateActivity).toHaveBeenCalledTimes(2);
    });
  });

  describe("scheduleEventSeriesDeactivation", () => {
    it("should schedule deactivation at series end date", async () => {
      const user = createTestUserRecord();
      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id);
      const endDate = new Date("2024-12-31");

      mockGetStartOfDayInTimezone.mockReturnValue(endDate);
      mockGetScheduledActivityForResource.mockResolvedValue(null);
      mockCreateActivity.mockResolvedValue("activity123" as Id<"activities">);

      await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn().mockResolvedValue("scheduledFunction123" as Id<"_scheduled_functions">),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        await scheduleEventSeriesDeactivation(ctx, "series123" as Id<"eventSeries">, series);
      });

      expect(mockGetStartOfDayInTimezone).toHaveBeenCalledWith(
        series.schedule.endDate,
        series.location.timezone,
      );
      expect(mockCreateActivity).toHaveBeenCalled();
    });
  });

  describe("activateEventSeries", () => {
    it("should activate event series by scheduling deactivation and generating events", async () => {
      const now = Date.now();
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: now,
          endDate: addDays(now, 30).getTime(),
          daysOfWeek: [1, 2, 3],
          interval: 1,
        },
      });
      const seriesId = await eventHelpers.insertEventSeries(seriesInput);
      const series = await eventHelpers.getEventSeries(seriesId);

      mockGetStartOfDayInTimezone.mockReturnValue(new Date(seriesInput.schedule.endDate));
      mockGetScheduledActivityForResource.mockResolvedValue(null);
      mockCreateActivity.mockResolvedValue("activity123" as Id<"activities">);

      await t.run(async (ctx) => {
        const mockRunMutation = vi.fn().mockResolvedValue({
          events: [
            createTestEventRecord(seriesId, clubId, userId, now),
            createTestEventRecord(seriesId, clubId, userId, addDays(now, 7).getTime()),
          ],
        });
        ctx.runMutation = mockRunMutation as typeof ctx.runMutation;

        await activateEventSeries(ctx, series!);

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
      await t.run(async (ctx) => {
        await scheduleNextEventGeneration(ctx, "series123" as Id<"eventSeries">, []);
      });

      // No scheduler calls should be made
    });

    it("should schedule next generation when conditions are met", async () => {
      const now = Date.now();
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesInput = createTestEventSeries(clubId, userId, {
        schedule: {
          startDate: now,
          endDate: addDays(now, 60).getTime(),
          daysOfWeek: [1, 2, 3],
          interval: 1,
        },
      });
      const seriesId = await eventHelpers.insertEventSeries(seriesInput);

      const currentDates = [now, addDays(now, 7).getTime()];
      const lastDate = addDays(now, 7).getTime();
      const scheduleDate = subDays(lastDate, MAX_EVENT_GENERATION_DAYS).getTime();

      // Mock future date check
      vi.useFakeTimers();
      vi.setSystemTime(scheduleDate - 1000);

      await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn().mockResolvedValue("scheduledFunction123" as Id<"_scheduled_functions">),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        await scheduleNextEventGeneration(ctx, seriesId, currentDates);

        expect(mockScheduler.runAt).toHaveBeenCalledWith(
          scheduleDate,
          expect.any(Object),
          expect.objectContaining({
            eventSeriesId: seriesId,
            range: expect.objectContaining({
              startDate: addDays(lastDate, 1).getTime(),
              endDate: seriesInput.schedule.endDate,
            }),
          }),
        );
      });
    });

    it("should not schedule when schedule date is in the past", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const seriesInput = createTestEventSeries(clubId, userId);
      const seriesId = await eventHelpers.insertEventSeries(seriesInput);
      const currentDates = [Date.now() - 1000];

      await t.run(async (ctx) => {
        const mockScheduler = {
          runAt: vi.fn(),
        };
        ctx.scheduler = mockScheduler as unknown as typeof ctx.scheduler;

        await scheduleNextEventGeneration(ctx, seriesId, currentDates);

        expect(mockScheduler.runAt).not.toHaveBeenCalled();
      });
    });
  });
});
