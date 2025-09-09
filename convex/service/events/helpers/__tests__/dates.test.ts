import { Id } from "@/convex/_generated/dataModel";
import { MAX_EVENT_GENERATION_DAYS } from "@/convex/constants/events";
import { generateUpcomingEventDates } from "@/convex/service/events/helpers/dates";
import { createTestEventSeriesRecord } from "@/test-utils/samples/events";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { addDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Date Helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("generateUpcomingEventDates", () => {
    it("should generate dates for weekly recurring events", () => {
      const user = createTestUserRecord();
      const startDate = new Date("2024-01-01").getTime();
      const endDate = new Date("2024-01-31").getTime();

      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id, {
        schedule: {
          startDate,
          endDate,
          daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
          interval: 1, // Every week
        },
        location: {
          timezone: "America/New_York",
          address: "123 Test St",
          placeId: "test-place-id",
          name: "Test Location",
        },
      });

      const dates = generateUpcomingEventDates(series, startDate, endDate);

      expect(dates.length).toBeGreaterThan(0);
      // Should have events on Mondays, Wednesdays, and Fridays
      expect(dates.length).toBeLessThanOrEqual(13); // Max possible in January
    });

    it("should respect maximum generation days limit", () => {
      const user = createTestUserRecord();
      const startDate = new Date("2024-01-01").getTime();
      const endDate = addDays(new Date("2024-01-01"), MAX_EVENT_GENERATION_DAYS + 30).getTime();

      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id, {
        schedule: {
          startDate,
          endDate,
          daysOfWeek: [1, 2, 3, 4, 5, 6, 0], // Every day
          interval: 1,
        },
        location: {
          timezone: "America/New_York",
          address: "123 Test St",
          placeId: "test-place-id",
          name: "Test Location",
        },
      });

      const dates = generateUpcomingEventDates(series, startDate, endDate);

      // Should not exceed MAX_EVENT_GENERATION_DAYS
      const maxExpectedDate = addDays(new Date(startDate), MAX_EVENT_GENERATION_DAYS).getTime();
      dates.forEach((date) => {
        expect(date).toBeLessThanOrEqual(maxExpectedDate);
      });
    });

    it("should handle bi-weekly intervals", () => {
      const user = createTestUserRecord();
      const startDate = new Date("2024-01-01").getTime();
      const endDate = new Date("2024-02-29").getTime();

      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id, {
        schedule: {
          startDate,
          endDate,
          daysOfWeek: [1], // Only Mondays
          interval: 2, // Every other week
        },
        location: {
          timezone: "America/New_York",
          address: "123 Test St",
          placeId: "test-place-id",
          name: "Test Location",
        },
      });

      const dates = generateUpcomingEventDates(series, startDate, endDate);

      // Should have fewer dates due to bi-weekly interval
      expect(dates.length).toBeLessThan(8); // Less than weekly would produce
    });

    it("should return empty array when no matching days", () => {
      const user = createTestUserRecord();
      const startDate = new Date("2024-01-01").getTime();
      const endDate = new Date("2024-01-07").getTime();

      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id, {
        schedule: {
          startDate,
          endDate,
          daysOfWeek: [], // No days selected
          interval: 1,
        },
        location: {
          timezone: "America/New_York",
          address: "123 Test St",
          placeId: "test-place-id",
          name: "Test Location",
        },
      });

      const dates = generateUpcomingEventDates(series, startDate, endDate);

      expect(dates).toEqual([]);
    });

    it("should handle timezone conversions correctly", () => {
      const user = createTestUserRecord();
      const startDate = new Date("2024-01-01T00:00:00Z").getTime();
      const endDate = new Date("2024-01-07T23:59:59Z").getTime();

      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id, {
        schedule: {
          startDate,
          endDate,
          daysOfWeek: [1], // Monday
          interval: 1,
        },
        location: {
          timezone: "Asia/Tokyo", // Different timezone
          address: "123 Test St",
          placeId: "test-place-id",
          name: "Test Location",
        },
      });

      const dates = generateUpcomingEventDates(series, startDate, endDate);

      expect(dates.length).toBeGreaterThan(0);
      // Dates should be valid timestamps
      dates.forEach((date) => {
        expect(typeof date).toBe("number");
        expect(date).toBeGreaterThan(0);
      });
    });

    it("should handle end date before max generation limit", () => {
      const user = createTestUserRecord();
      const startDate = new Date("2024-01-01").getTime();
      const endDate = new Date("2024-01-14").getTime(); // Short period

      const series = createTestEventSeriesRecord("club123" as Id<"clubs">, user._id, {
        schedule: {
          startDate,
          endDate,
          daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
          interval: 1,
        },
        location: {
          timezone: "America/New_York",
          address: "123 Test St",
          placeId: "test-place-id",
          name: "Test Location",
        },
      });

      const dates = generateUpcomingEventDates(series, startDate, endDate);

      // Should respect the shorter end date
      dates.forEach((date) => {
        expect(date).toBeLessThanOrEqual(endDate);
      });
    });
  });
});
