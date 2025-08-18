import { Id } from "@/convex/_generated/dataModel";
import {
  END_TIME_AFTER_START_ERROR,
  SESSION_DATE_FUTURE_ERROR,
  SESSION_DATE_REQUIRED_ONE_TIME_ERROR,
  SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
  SESSION_DAY_OF_MONTH_REQUIRED_ERROR,
  SESSION_DAY_OF_WEEK_REQUIRED_ERROR,
  SESSION_END_DATE_AFTER_START_ERROR,
  SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
  SESSION_START_DATE_FUTURE_ERROR,
  SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
  TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
  TIMESLOT_DURATION_REQUIRED_ERROR,
  TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
  TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
  TIMESLOT_START_END_REQUIRED_ERROR,
  TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
} from "@/convex/constants/errors";
import {
  MAX_PARTICIPANTS,
  MAX_SESSION_START_DATE_DAYS_FROM_NOW,
  SESSION_RECURRENCE,
  SESSION_VISIBILITY,
} from "@/convex/constants/sessions";
import {
  validateSessionSchedule,
  validateSessionTemplate,
  validateSessionTimeslots,
  validateSessionVisibility,
} from "@/convex/service/utils/validators/sessions";
import { createTestClubRecord } from "@/test-utils/samples/clubs";
import {
  createDurationTimeslot,
  createMonthlySchedule,
  createOneTimeSchedule,
  createRecurringSchedule,
  createStartEndTimeslot,
  createTestSessionTemplateInput,
  createWeeklySchedule,
} from "@/test-utils/samples/sessions";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("validateSessionVisibility", () => {
  it("should allow public sessions for public clubs", () => {
    const publicClub = createTestClubRecord("user123" as Id<"users">, { isPublic: true });

    expect(() => validateSessionVisibility(publicClub, SESSION_VISIBILITY.PUBLIC)).not.toThrow();
  });

  it("should allow members-only sessions for public clubs", () => {
    const publicClub = createTestClubRecord("user123" as Id<"users">, { isPublic: true });

    expect(() =>
      validateSessionVisibility(publicClub, SESSION_VISIBILITY.MEMBERS_ONLY),
    ).not.toThrow();
  });

  it("should allow private sessions for public clubs", () => {
    const publicClub = createTestClubRecord("user123" as Id<"users">, { isPublic: true });

    expect(() => validateSessionVisibility(publicClub, SESSION_VISIBILITY.PRIVATE)).not.toThrow();
  });

  it("should throw when private club tries to create public session", () => {
    const privateClub = createTestClubRecord("user123" as Id<"users">, { isPublic: false });

    expect(() => validateSessionVisibility(privateClub, SESSION_VISIBILITY.PUBLIC)).toThrow(
      SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should allow members-only sessions for private clubs", () => {
    const privateClub = createTestClubRecord("user123" as Id<"users">, { isPublic: false });

    expect(() =>
      validateSessionVisibility(privateClub, SESSION_VISIBILITY.MEMBERS_ONLY),
    ).not.toThrow();
  });

  it("should allow private sessions for private clubs", () => {
    const privateClub = createTestClubRecord("user123" as Id<"users">, { isPublic: false });

    expect(() => validateSessionVisibility(privateClub, SESSION_VISIBILITY.PRIVATE)).not.toThrow();
  });
});

describe("validateSessionSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("time validation", () => {
    it("should throw when start time is after end time", () => {
      const schedule = createRecurringSchedule({
        startTime: "20:00",
        endTime: "18:00",
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should throw when start time equals end time", () => {
      const schedule = createRecurringSchedule({
        startTime: "18:00",
        endTime: "18:00",
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should pass when start time is before end time", () => {
      const schedule = createRecurringSchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).not.toThrow();
    });
  });

  describe("ONE_TIME sessions", () => {
    it("should throw when date is undefined", () => {
      const schedule = createOneTimeSchedule({ date: undefined });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow(
        SESSION_DATE_REQUIRED_ONE_TIME_ERROR,
      );
    });

    it("should throw when date is in the past", () => {
      const schedule = createOneTimeSchedule({
        date: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow(
        SESSION_DATE_FUTURE_ERROR,
      );
    });

    it("should throw when date is too far in the future", () => {
      const schedule = createOneTimeSchedule({
        date: Date.now() + (MAX_SESSION_START_DATE_DAYS_FROM_NOW + 1) * 24 * 60 * 60 * 1000,
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow(
        SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
      );
    });

    it("should pass when date is valid", () => {
      const schedule = createOneTimeSchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).not.toThrow();
    });
  });

  describe("DAILY sessions", () => {
    it("should throw when start date is undefined", () => {
      const schedule = createRecurringSchedule({ startDate: undefined });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
      );
    });

    it("should throw when end date is undefined", () => {
      const schedule = createRecurringSchedule({ endDate: undefined });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
      );
    });

    it("should throw when start date is in the past", () => {
      const schedule = createRecurringSchedule({
        startDate: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_START_DATE_FUTURE_ERROR,
      );
    });

    it("should throw when end date is before start date", () => {
      const schedule = createRecurringSchedule({
        startDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_END_DATE_AFTER_START_ERROR,
      );
    });

    it("should throw when start date is too far in the future", () => {
      const schedule = createRecurringSchedule({
        startDate: Date.now() + (MAX_SESSION_START_DATE_DAYS_FROM_NOW + 1) * 24 * 60 * 60 * 1000,
        endDate: Date.now() + (MAX_SESSION_START_DATE_DAYS_FROM_NOW + 30) * 24 * 60 * 60 * 1000,
      });

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
      );
    });

    it("should pass when dates are valid", () => {
      const schedule = createRecurringSchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).not.toThrow();
    });
  });

  describe("WEEKLY sessions", () => {
    it("should throw when dayOfWeek is undefined", () => {
      const schedule = createRecurringSchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.WEEKLY)).toThrow(
        SESSION_DAY_OF_WEEK_REQUIRED_ERROR,
      );
    });

    it("should pass when dayOfWeek is provided and dates are valid", () => {
      const schedule = createWeeklySchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.WEEKLY)).not.toThrow();
    });
  });

  describe("MONTHLY sessions", () => {
    it("should throw when dayOfMonth is undefined", () => {
      const schedule = createRecurringSchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.MONTHLY)).toThrow(
        SESSION_DAY_OF_MONTH_REQUIRED_ERROR,
      );
    });

    it("should pass when dayOfMonth is provided and dates are valid", () => {
      const schedule = createMonthlySchedule();

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.MONTHLY)).not.toThrow();
    });
  });
});

describe("validateSessionTimeslots", () => {
  const baseSchedule = createRecurringSchedule();

  describe("DURATION timeslots", () => {
    it("should throw when duration is missing", () => {
      const timeslots = [createDurationTimeslot({ duration: undefined })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_DURATION_REQUIRED_ERROR,
      );
    });

    it("should throw when duration exceeds session duration", () => {
      const timeslots = [createDurationTimeslot({ duration: 180 })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should pass when duration is valid", () => {
      const timeslots = [createDurationTimeslot()];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).not.toThrow();
    });
  });

  describe("START_END timeslots", () => {
    it("should throw when startTime is missing", () => {
      const timeslots = [createStartEndTimeslot({ startTime: undefined })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when endTime is missing", () => {
      const timeslots = [createStartEndTimeslot({ endTime: undefined })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when timeslot is outside session time range", () => {
      const timeslots = [createStartEndTimeslot({ startTime: "17:00", endTime: "19:00" })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should throw when timeslot start time is after end time", () => {
      const timeslots = [createStartEndTimeslot({ startTime: "19:00", endTime: "18:30" })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should pass when timeslot times are valid", () => {
      const timeslots = [createStartEndTimeslot()];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).not.toThrow();
    });
  });

  describe("permanent participants validation", () => {
    it("should throw when permanent participants exceed max participants", () => {
      const timeslots = [
        createDurationTimeslot({
          maxParticipants: 5,
          permanentParticipants: ["user1", "user2", "user3", "user4", "user5", "user6"],
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
      );
    });
  });

  describe("total participants validation", () => {
    it("should throw when total max participants exceed system limit", () => {
      const timeslots = Array.from({ length: 10 }, (_, i) =>
        createDurationTimeslot({
          name: `Slot ${i}`,
          maxParticipants: MAX_PARTICIPANTS / 5,
        }),
      );

      expect(() => validateSessionTimeslots(baseSchedule, timeslots)).toThrow(
        TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
      );
    });
  });
});

describe("validateSessionTemplate", () => {
  it("should validate complete session template successfully", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const sessionTemplate = createTestSessionTemplateInput();

    expect(() => validateSessionTemplate(sessionTemplate, club)).not.toThrow();
  });

  it("should throw for invalid visibility", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: false });
    const sessionTemplate = createTestSessionTemplateInput({
      visibility: SESSION_VISIBILITY.PUBLIC,
    });

    expect(() => validateSessionTemplate(sessionTemplate, club)).toThrow(
      SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should throw for invalid schedule", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const sessionTemplate = createTestSessionTemplateInput({
      schedule: createRecurringSchedule({
        startTime: "20:00",
        endTime: "18:00", // Invalid: end before start
      }),
    });

    expect(() => validateSessionTemplate(sessionTemplate, club)).toThrow(
      END_TIME_AFTER_START_ERROR,
    );
  });

  it("should throw for invalid timeslots", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const sessionTemplate = createTestSessionTemplateInput({
      timeslots: [createDurationTimeslot({ duration: undefined })],
    });

    expect(() => validateSessionTemplate(sessionTemplate, club)).toThrow(
      TIMESLOT_DURATION_REQUIRED_ERROR,
    );
  });
});
