import { QueryCtx } from "@/convex/_generated/server";
import {
  END_TIME_AFTER_START_ERROR,
  EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
  EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR,
  EVENT_DAY_OF_MONTH_REQUIRED_ERROR,
  EVENT_DAY_OF_WEEK_REQUIRED_ERROR,
  EVENT_END_DATE_AFTER_START_ERROR,
  EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR,
  EVENT_START_DATE_FUTURE_ERROR,
  EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
  EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
  EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
  EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
  EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
  EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
  TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
  TIMESLOT_DURATION_REQUIRED_ERROR,
  TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
  TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
  TIMESLOT_START_END_REQUIRED_ERROR,
  TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
} from "@/convex/constants/errors";
import {
  EVENT_RECURRENCE,
  EVENT_STATUS,
  EVENT_VISIBILITY,
  FEE_TYPE,
  MAX_EVENT_START_DATE_DAYS_FROM_NOW,
  MAX_PARTICIPANTS,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import {
  validateEventSchedule,
  validateEventScheduleForUpdate,
  validateEventSeriesForCreate,
  validateEventSeriesForUpdate,
  validateEventStatusForJoinLeave,
  validateEventTimeslots,
  validateEventVisibility,
} from "@/convex/service/utils/validators/events";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import {
  createTestEventRecord,
  createTestEventSeriesInput,
  createTestEventSeriesRecord,
  createTestTimeslotSeries,
} from "@/test-utils/samples/events";
import { genId } from "@/test-utils/samples/id";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("validateEventVisibility", () => {
  it("should allow public events for public clubs", () => {
    const publicClub = createTestClubRecord(genId<"users">("users"), { isPublic: true });

    expect(() => validateEventVisibility(publicClub, EVENT_VISIBILITY.PUBLIC)).not.toThrow();
  });

  it("should allow members-only events for public clubs", () => {
    const publicClub = createTestClubRecord(genId<"users">("users"), { isPublic: true });

    expect(() => validateEventVisibility(publicClub, EVENT_VISIBILITY.MEMBERS_ONLY)).not.toThrow();
  });

  it("should throw when private club tries to create public event", () => {
    const privateClub = createTestClubRecord(genId<"users">("users"), { isPublic: false });

    expect(() => validateEventVisibility(privateClub, EVENT_VISIBILITY.PUBLIC)).toThrow(
      EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should allow members-only events for private clubs", () => {
    const privateClub = createTestClubRecord(genId<"users">("users"), { isPublic: false });

    expect(() => validateEventVisibility(privateClub, EVENT_VISIBILITY.MEMBERS_ONLY)).not.toThrow();
  });
});

describe("validateEventSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("time validation", () => {
    it("should throw when start time is after end time", () => {
      const schedule = {
        startTime: "20:00",
        endTime: "18:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should throw when start time equals end time", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "18:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should pass when start time is before end time", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).not.toThrow();
    });
  });

  describe("DAILY events", () => {
    it("should throw when start date is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: undefined,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR,
      );
    });

    it("should throw when end date is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: undefined,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        EVENT_RECURRING_START_END_DATE_REQUIRED_ERROR,
      );
    });

    it("should throw when start date is in the past", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        EVENT_START_DATE_FUTURE_ERROR,
      );
    });

    it("should throw when end date is before start date", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        EVENT_END_DATE_AFTER_START_ERROR,
      );
    });

    it("should throw when start date is too far in the future", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + (MAX_EVENT_START_DATE_DAYS_FROM_NOW + 1) * 24 * 60 * 60 * 1000,
        endDate: Date.now() + (MAX_EVENT_START_DATE_DAYS_FROM_NOW + 30) * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow(
        EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR,
      );
    });

    it("should pass when dates are valid", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).not.toThrow();
    });

    it("should throw when dayOfWeek parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfWeek: 1,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow();
    });

    it("should throw when dayOfMonth parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfMonth: 15,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.DAILY)).toThrow();
    });
  });

  describe("WEEKLY events", () => {
    it("should throw when dayOfWeek is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.WEEKLY)).toThrow(
        EVENT_DAY_OF_WEEK_REQUIRED_ERROR,
      );
    });

    it("should pass when dayOfWeek is provided and dates are valid", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfWeek: 1,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.WEEKLY)).not.toThrow();
    });

    it("should throw when dayOfMonth parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfWeek: 1,
        dayOfMonth: 15,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.WEEKLY)).toThrow();
    });
  });

  describe("MONTHLY events", () => {
    it("should throw when dayOfMonth is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.MONTHLY)).toThrow(
        EVENT_DAY_OF_MONTH_REQUIRED_ERROR,
      );
    });

    it("should pass when dayOfMonth is provided and dates are valid", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfMonth: 15,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.MONTHLY)).not.toThrow();
    });

    it("should throw when dayOfWeek parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfMonth: 15,
        dayOfWeek: 1,
      };

      expect(() => validateEventSchedule(schedule, EVENT_RECURRENCE.MONTHLY)).toThrow();
    });
  });
});

describe("validateEventTimeslots", () => {
  const baseSchedule = {
    startTime: "18:00",
    endTime: "20:00",
    startDate: Date.now() + 24 * 60 * 60 * 1000,
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const clubId = genId<"clubs">("clubs");
  const user1Id = genId<"users">("users");
  const user2Id = genId<"users">("users");
  const user3Id = genId<"users">("users");
  const clubMembers = [
    createTestClubMembershipRecord(clubId, user1Id),
    createTestClubMembershipRecord(clubId, user2Id),
    createTestClubMembershipRecord(clubId, user3Id),
  ];

  describe("DURATION timeslots", () => {
    it("should throw when duration is missing", () => {
      const timeslots = [createTestTimeslotSeries({ duration: undefined })];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_DURATION_REQUIRED_ERROR,
      );
    });

    it("should throw when duration exceeds event duration", () => {
      const timeslots = [createTestTimeslotSeries({ duration: 180 })];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should pass when duration is valid", () => {
      const timeslots = [createTestTimeslotSeries()];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).not.toThrow();
    });
  });

  describe("START_END timeslots", () => {
    it("should throw when startTime is missing", () => {
      const timeslots = [
        createTestTimeslotSeries({ type: TIMESLOT_TYPE.START_END, startTime: undefined }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when endTime is missing", () => {
      const timeslots = [
        createTestTimeslotSeries({ type: TIMESLOT_TYPE.START_END, endTime: undefined }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when timeslot is outside event time range", () => {
      const timeslots = [
        createTestTimeslotSeries({
          type: TIMESLOT_TYPE.START_END,
          startTime: "17:00",
          endTime: "19:00",
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should throw when timeslot start time is after end time", () => {
      const timeslots = [
        createTestTimeslotSeries({
          type: TIMESLOT_TYPE.START_END,
          startTime: "19:00",
          endTime: "18:30",
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should pass when timeslot times are valid", () => {
      const timeslots = [
        createTestTimeslotSeries({
          type: TIMESLOT_TYPE.START_END,
          startTime: "18:00",
          endTime: "19:00",
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).not.toThrow();
    });
  });

  describe("permanent participants validation", () => {
    it("should throw when permanent participants exceed max participants", () => {
      const timeslots = [
        createTestTimeslotSeries({
          maxParticipants: 5,
          permanentParticipants: [
            user1Id,
            user2Id,
            user3Id,
            genId<"users">("users"),
            genId<"users">("users"),
            genId<"users">("users"),
          ],
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
      );
    });

    it("should throw when permanent participants are not unique", () => {
      const timeslots = [
        createTestTimeslotSeries({
          permanentParticipants: [user1Id, user2Id, user1Id],
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
      );
    });

    it("should throw when permanent participant is not a club member", () => {
      const timeslots = [
        createTestTimeslotSeries({
          permanentParticipants: [user1Id, genId<"users">("users")],
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
      );
    });

    it("should pass when permanent participants are valid", () => {
      const timeslots = [
        createTestTimeslotSeries({
          permanentParticipants: [user1Id, user2Id],
        }),
      ];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).not.toThrow();
    });
  });

  describe("general validation", () => {
    it("should throw when no timeslots provided", () => {
      expect(() => validateEventTimeslots(baseSchedule, [], clubMembers)).toThrow(
        EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
      );
    });

    it("should throw when maxParticipants is zero", () => {
      const timeslots = [createTestTimeslotSeries({ maxParticipants: 0 })];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
      );
    });

    it("should throw when FIXED fee type missing fee", () => {
      const timeslots = [createTestTimeslotSeries({ feeType: FEE_TYPE.FIXED, fee: undefined })];

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
      );
    });
  });

  describe("total participants validation", () => {
    it("should throw when total max participants exceed system limit", () => {
      const timeslots = Array.from({ length: 10 }, (_, i) =>
        createTestTimeslotSeries({
          name: `Slot ${i}`,
          maxParticipants: MAX_PARTICIPANTS / 5,
        }),
      );

      expect(() => validateEventTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
      );
    });
  });
});

describe("validateEventSeriesForCreate", () => {
  let ctx: QueryCtx;
  beforeEach(() => {
    ctx = createMockCtx<QueryCtx>();
  });

  it("should validate complete event series successfully", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const eventSeries = createTestEventSeriesInput(club._id);
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).resolves.not.toThrow();
  });

  it("should throw for invalid visibility", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: false });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const eventSeries = createTestEventSeriesInput(club._id, {
      visibility: EVENT_VISIBILITY.PUBLIC,
    });
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).rejects.toThrow(
      EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should throw for invalid schedule", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const eventSeries = createTestEventSeriesInput(club._id, {
      schedule: {
        startTime: "20:00",
        endTime: "18:00", // Invalid: end before start
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
    });
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).rejects.toThrow(
      END_TIME_AFTER_START_ERROR,
    );
  });

  it("should throw for invalid timeslots", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const eventSeries = createTestEventSeriesInput(club._id, {
      timeslots: [createTestTimeslotSeries({ duration: undefined })],
    });
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).rejects.toThrow(
      TIMESLOT_DURATION_REQUIRED_ERROR,
    );
  });
});

describe("validateEventStatusForJoinLeave", () => {
  it("should pass when event status is NOT_STARTED", () => {
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: EVENT_STATUS.NOT_STARTED },
    );

    expect(() => validateEventStatusForJoinLeave(event)).not.toThrow();
  });

  it("should throw when event status is IN_PROGRESS", () => {
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: EVENT_STATUS.IN_PROGRESS },
    );

    expect(() => validateEventStatusForJoinLeave(event)).toThrow(
      EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });

  it("should throw when event status is COMPLETED", () => {
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: EVENT_STATUS.COMPLETED },
    );

    expect(() => validateEventStatusForJoinLeave(event)).toThrow(
      EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });

  it("should throw when event status is CANCELLED", () => {
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: EVENT_STATUS.CANCELLED },
    );

    expect(() => validateEventStatusForJoinLeave(event)).toThrow(
      EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });
});

describe("validateEventSeriesForUpdate", () => {
  let ctx: QueryCtx;
  beforeEach(() => {
    ctx = createMockCtx<QueryCtx>();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should validate partial update successfully", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const existingEventSeries = createTestEventSeriesRecord(club._id, user._id);
    const updateInput = { visibility: EVENT_VISIBILITY.MEMBERS_ONLY };
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(
      validateEventSeriesForUpdate(ctx, updateInput, club, existingEventSeries),
    ).resolves.not.toThrow();
  });

  it("should throw for invalid visibility update", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: false });
    const existingEventSeries = createTestEventSeriesRecord(club._id, user._id);
    const updateInput = { visibility: EVENT_VISIBILITY.PUBLIC };

    await expect(
      validateEventSeriesForUpdate(ctx, updateInput, club, existingEventSeries),
    ).rejects.toThrow(EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR);
  });

  it("should validate timeslots update with existing schedule", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const existingEventSeries = createTestEventSeriesRecord(club._id, user._id);
    const updateInput = { timeslots: [createTestTimeslotSeries()] };
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(
      validateEventSeriesForUpdate(ctx, updateInput, club, existingEventSeries),
    ).resolves.not.toThrow();
  });
});

describe("validateEventScheduleForUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const existingSchedule = {
    startTime: "18:00",
    endTime: "20:00",
    startDate: Date.now() + 24 * 60 * 60 * 1000,
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };

  it("should validate partial time update", () => {
    const scheduleUpdate = { startTime: "19:00" };

    expect(() =>
      validateEventScheduleForUpdate(scheduleUpdate, EVENT_RECURRENCE.DAILY, existingSchedule),
    ).not.toThrow();
  });

  it("should throw when updating both times with invalid range", () => {
    const scheduleUpdate = { startTime: "20:00", endTime: "18:00" };

    expect(() =>
      validateEventScheduleForUpdate(scheduleUpdate, EVENT_RECURRENCE.DAILY, existingSchedule),
    ).toThrow(END_TIME_AFTER_START_ERROR);
  });

  it("should throw when updating startDate to past for recurring events", () => {
    const scheduleUpdate = { startDate: Date.now() - 24 * 60 * 60 * 1000 };

    expect(() =>
      validateEventScheduleForUpdate(scheduleUpdate, EVENT_RECURRENCE.WEEKLY, existingSchedule),
    ).toThrow(EVENT_START_DATE_FUTURE_ERROR);
  });

  it("should throw when merged schedule has invalid date range", () => {
    const scheduleUpdate = { endDate: Date.now() + 12 * 60 * 60 * 1000 }; // Before existing startDate

    expect(() =>
      validateEventScheduleForUpdate(scheduleUpdate, EVENT_RECURRENCE.WEEKLY, existingSchedule),
    ).toThrow(EVENT_END_DATE_AFTER_START_ERROR);
  });
});
