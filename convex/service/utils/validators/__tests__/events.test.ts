import { QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  END_TIME_AFTER_START_ERROR,
  EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
  EVENT_DATE_FUTURE_ERROR,
  EVENT_DATE_RANGE_INVALID_ERROR,
  EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR,
  EVENT_END_DATE_AFTER_START_ERROR,
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
  EVENT_STATUS,
  EVENT_VISIBILITY,
  FEE_TYPE,
  MAX_EVENT_SERIES_DURATION_MONTHS,
  MAX_EVENT_START_DATE_DAYS_FROM_NOW,
  MAX_PARTICIPANTS,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import * as clubDatabase from "@/convex/service/clubs/database";
import { EventCreateInput } from "@/convex/service/events/schemas";
import {
  isEventDateRangeValid,
  validateEventAccess,
  validateEventDate,
  validateEventDateRange,
  validateEventForCreate,
  validateEventSeriesForCreate,
  validateEventSeriesForUpdate,
  validateEventStatusForJoinLeave,
  validateEventTime,
  validateEventTimeslots,
  validateEventVisibility,
  validateRecurringSchedule,
} from "@/convex/service/utils/validators/events";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import {
  createTestEventRecord,
  createTestEventSeriesInput,
  createTestEventSeriesRecord,
  createTestTimeslot,
  createTestTimeslotInput,
} from "@/test-utils/samples/events";
import { genId } from "@/test-utils/samples/id";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/clubs/database");
const mockGetClubMembershipForUser = vi.mocked(clubDatabase.getClubMembershipForUser);

// Date calculation constants
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;
const SIXTY_DAYS_MS = 60 * ONE_DAY_MS;

describe("isEventDateRangeValid", () => {
  it("should return true for date range within 30 days", () => {
    const fromDate = Date.now();
    const toDate = fromDate + 29 * ONE_DAY_MS;
    expect(isEventDateRangeValid({ fromDate, toDate })).toBe(true);
  });

  it("should return true for date range exactly 30 days", () => {
    const fromDate = Date.now();
    const toDate = fromDate + THIRTY_DAYS_MS;
    expect(isEventDateRangeValid({ fromDate, toDate })).toBe(true);
  });

  it("should return false for date range exceeding 30 days", () => {
    const fromDate = Date.now();
    const toDate = fromDate + 31 * ONE_DAY_MS;
    expect(isEventDateRangeValid({ fromDate, toDate })).toBe(false);
  });

  it("should return false for negative date range", () => {
    const fromDate = Date.now();
    const toDate = fromDate - ONE_DAY_MS;
    expect(isEventDateRangeValid({ fromDate, toDate })).toBe(false);
  });
});

describe("validateEventTime", () => {
  it("should pass when start time is before end time", () => {
    expect(() => validateEventTime("18:00", "20:00")).not.toThrow();
  });

  it("should throw when start time equals end time", () => {
    expect(() => validateEventTime("18:00", "18:00")).toThrow(END_TIME_AFTER_START_ERROR);
  });

  it("should throw when start time is after end time", () => {
    expect(() => validateEventTime("20:00", "18:00")).toThrow(END_TIME_AFTER_START_ERROR);
  });
});

describe("validateEventDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should pass when date is in the future", () => {
    const futureDate = Date.now() + ONE_DAY_MS;
    expect(() => validateEventDate(futureDate)).not.toThrow();
  });

  it("should throw when date is in the past", () => {
    const pastDate = Date.now() - ONE_DAY_MS;
    expect(() => validateEventDate(pastDate)).toThrow(EVENT_DATE_FUTURE_ERROR);
  });

  it("should throw when date is too far in the future", () => {
    const farFutureDate = Date.now() + (MAX_EVENT_START_DATE_DAYS_FROM_NOW + 1) * ONE_DAY_MS;
    expect(() => validateEventDate(farFutureDate)).toThrow(EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR);
  });
});

describe("validateRecurringSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should throw when startDate is in the past", () => {
    const schedule = {
      startDate: Date.now() - ONE_DAY_MS,
      endDate: Date.now() + THIRTY_DAYS_MS,
      daysOfWeek: [1, 2, 3],
      interval: 1,
    };

    expect(() => validateRecurringSchedule(schedule)).toThrow(EVENT_START_DATE_FUTURE_ERROR);
  });

  it("should throw when endDate is before startDate", () => {
    const schedule = {
      startDate: Date.now() + THIRTY_DAYS_MS,
      endDate: Date.now() + SEVEN_DAYS_MS,
      daysOfWeek: [1, 2, 3],
      interval: 1,
    };

    expect(() => validateRecurringSchedule(schedule)).toThrow(EVENT_END_DATE_AFTER_START_ERROR);
  });

  it("should throw when startDate is too far in the future", () => {
    const schedule = {
      startDate: Date.now() + (MAX_EVENT_START_DATE_DAYS_FROM_NOW + 1) * ONE_DAY_MS,
      endDate: Date.now() + (MAX_EVENT_START_DATE_DAYS_FROM_NOW + 30) * ONE_DAY_MS,
      daysOfWeek: [1, 2, 3],
      interval: 1,
    };

    expect(() => validateRecurringSchedule(schedule)).toThrow(EVENT_DATE_TOO_FAR_IN_FUTURE_ERROR);
  });

  it("should pass when dates are valid", () => {
    const schedule = {
      startDate: Date.now() + ONE_DAY_MS,
      endDate: Date.now() + THIRTY_DAYS_MS,
      daysOfWeek: [1, 2, 3],
      interval: 1,
    };

    expect(() => validateRecurringSchedule(schedule)).not.toThrow();
  });

  it("should throw when event series duration exceeds maximum months", () => {
    const schedule = {
      startDate: Date.now() + ONE_DAY_MS,
      endDate: Date.now() + (MAX_EVENT_SERIES_DURATION_MONTHS + 1) * 30 * ONE_DAY_MS,
      daysOfWeek: [1, 2, 3],
      interval: 1,
    };

    expect(() => validateRecurringSchedule(schedule)).toThrow();
  });

  it("should pass when event series duration is within maximum months", () => {
    const schedule = {
      startDate: Date.now() + ONE_DAY_MS,
      endDate: Date.now() + (MAX_EVENT_SERIES_DURATION_MONTHS - 1) * 30 * ONE_DAY_MS,
      daysOfWeek: [1, 2, 3],
      interval: 1,
    };

    expect(() => validateRecurringSchedule(schedule)).not.toThrow();
  });
});

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

describe("validateEventTimeslots", () => {
  const startTime = "18:00";
  const endTime = "20:00";
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
      const timeslots = [createTestTimeslotInput({ duration: undefined })];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_DURATION_REQUIRED_ERROR,
      );
    });

    it("should throw when duration exceeds event duration", () => {
      const timeslots = [createTestTimeslotInput({ duration: 180 })];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should pass when duration is valid", () => {
      const timeslots = [createTestTimeslotInput()];

      expect(() =>
        validateEventTimeslots(startTime, endTime, timeslots, clubMembers),
      ).not.toThrow();
    });
  });

  describe("START_END timeslots", () => {
    it("should throw when startTime is missing", () => {
      const timeslots = [
        createTestTimeslotInput({ type: TIMESLOT_TYPE.START_END, startTime: undefined }),
      ];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when endTime is missing", () => {
      const timeslots = [
        createTestTimeslotInput({ type: TIMESLOT_TYPE.START_END, endTime: undefined }),
      ];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when timeslot is outside event time range", () => {
      const timeslots = [
        createTestTimeslotInput({
          type: TIMESLOT_TYPE.START_END,
          startTime: "17:00",
          endTime: "19:00",
        }),
      ];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should throw when timeslot start time is after end time", () => {
      const timeslots = [
        createTestTimeslotInput({
          type: TIMESLOT_TYPE.START_END,
          startTime: "19:00",
          endTime: "18:30",
        }),
      ];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should pass when timeslot times are valid", () => {
      const timeslots = [
        createTestTimeslotInput({
          type: TIMESLOT_TYPE.START_END,
          startTime: "18:00",
          endTime: "19:00",
        }),
      ];

      expect(() =>
        validateEventTimeslots(startTime, endTime, timeslots, clubMembers),
      ).not.toThrow();
    });
  });

  describe("permanent participants validation", () => {
    it("should throw when permanent participants exceed max participants", () => {
      const timeslots = [
        createTestTimeslotInput({
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

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
      );
    });

    it("should throw when permanent participants are not unique", () => {
      const timeslots = [
        createTestTimeslotInput({
          permanentParticipants: [user1Id, user2Id, user1Id],
        }),
      ];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
      );
    });

    it("should throw when permanent participant is not a club member", () => {
      const timeslots = [
        createTestTimeslotInput({
          permanentParticipants: [user1Id, genId<"users">("users")],
        }),
      ];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
      );
    });

    it("should pass when permanent participants are valid", () => {
      const timeslots = [
        createTestTimeslotInput({
          permanentParticipants: [user1Id, user2Id],
        }),
      ];

      expect(() =>
        validateEventTimeslots(startTime, endTime, timeslots, clubMembers),
      ).not.toThrow();
    });
  });

  describe("general validation", () => {
    it("should throw when no timeslots provided", () => {
      expect(() => validateEventTimeslots(startTime, endTime, [], clubMembers)).toThrow(
        EVENT_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
      );
    });

    it("should throw when maxParticipants is zero", () => {
      const timeslots = [createTestTimeslotInput({ maxParticipants: 0 })];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
      );
    });

    it("should throw when FIXED fee type missing fee", () => {
      const timeslots = [createTestTimeslotInput({ feeType: FEE_TYPE.FIXED, fee: undefined })];

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        EVENT_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
      );
    });
  });

  describe("total participants validation", () => {
    it("should throw when total max participants exceed system limit", () => {
      const timeslots = Array.from({ length: 10 }, (_, i) =>
        createTestTimeslotInput({
          name: `Slot ${i}`,
          maxParticipants: MAX_PARTICIPANTS / 5,
        }),
      );

      expect(() => validateEventTimeslots(startTime, endTime, timeslots, clubMembers)).toThrow(
        TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
      );
    });
  });
});

describe("validateEventForCreate", () => {
  let ctx: QueryCtx;
  beforeEach(() => {
    ctx = createMockCtx<QueryCtx>();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should validate single event successfully", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const eventSeries = createTestEventSeriesRecord(club._id, user._id);
    const date = Date.now() + ONE_DAY_MS;
    const event: EventCreateInput = createTestEventRecord(
      eventSeries._id,
      club._id,
      user._id,
      date,
      {
        clubId: club._id,
        name: "Test Event",
        description: "Test Description",
        startTime: "18:00",
        endTime: "20:00",
        visibility: EVENT_VISIBILITY.PUBLIC,
        timeslots: [createTestTimeslot()],
      },
    );
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(validateEventForCreate(ctx, event, club)).resolves.not.toThrow();
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

  it("should throw for invalid timeslots", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const eventSeries = createTestEventSeriesInput(club._id, {
      timeslots: [createTestTimeslotInput({ duration: undefined })],
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
      genId<"users">("users"),
      Date.now(),
      { status: EVENT_STATUS.NOT_STARTED },
    );

    expect(() => validateEventStatusForJoinLeave(event)).not.toThrow();
  });

  it("should throw when event status is IN_PROGRESS", () => {
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      genId<"clubs">("clubs"),
      genId<"users">("users"),
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
      genId<"users">("users"),
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
      genId<"users">("users"),
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
      validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
    ).resolves.not.toThrow();
  });

  it("should throw for invalid visibility update", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: false });
    const existingEventSeries = createTestEventSeriesRecord(club._id, user._id);
    const updateInput = { visibility: EVENT_VISIBILITY.PUBLIC };

    await expect(
      validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
    ).rejects.toThrow(EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR);
  });

  it("should validate timeslots update with existing schedule", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const existingEventSeries = createTestEventSeriesRecord(club._id, user._id);
    const updateInput = { timeslots: [createTestTimeslotInput()] };
    const mockQuery = {
      withIndex: vi.fn(() => ({
        collect: vi.fn().mockResolvedValueOnce(clubMembers),
      })),
    };
    vi.mocked(ctx.db.query).mockReturnValueOnce(
      mockQuery as unknown as ReturnType<typeof ctx.db.query>,
    );

    await expect(
      validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
    ).resolves.not.toThrow();
  });

  it("should validate schedule and recurrence update together", async () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const existingEventSeries = createTestEventSeriesRecord(club._id, user._id);
    const updateInput = {
      schedule: {
        startDate: Date.now() + 2 * ONE_DAY_MS,
        endDate: Date.now() + SIXTY_DAYS_MS,
        daysOfWeek: [1, 2, 3],
        interval: 1,
      },
    };

    await expect(
      validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
    ).resolves.not.toThrow();
  });
});

describe("validateEventDateRange", () => {
  it("should pass when date range is valid", () => {
    const fromDate = Date.now();
    const toDate = fromDate + 29 * ONE_DAY_MS;
    expect(() => validateEventDateRange(fromDate, toDate)).not.toThrow();
  });

  it("should throw when date range exceeds maximum days", () => {
    const fromDate = Date.now();
    const toDate = fromDate + 31 * ONE_DAY_MS;
    expect(() => validateEventDateRange(fromDate, toDate)).toThrow(EVENT_DATE_RANGE_INVALID_ERROR);
  });
});

describe("validateEventAccess", () => {
  let ctx: QueryCtx;
  beforeEach(() => {
    ctx = createMockCtx<QueryCtx>();
    vi.clearAllMocks();
  });

  it("should pass for public events", async () => {
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      genId<"clubs">("clubs"),
      genId<"users">("users"),
      Date.now(),
      { visibility: EVENT_VISIBILITY.PUBLIC },
    );
    const userId = genId<"users">("users");

    await expect(validateEventAccess(ctx, event, userId)).resolves.not.toThrow();
  });

  it("should pass for members-only events when user is a member", async () => {
    const clubId = genId<"clubs">("clubs");
    const userId = genId<"users">("users");
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      clubId,
      genId<"users">("users"),
      Date.now(),
      { visibility: EVENT_VISIBILITY.MEMBERS_ONLY, clubId },
    );
    const membership = createTestClubMembershipRecord(clubId, userId);

    vi.mocked(ctx.db.get).mockResolvedValue(
      createTestClubRecord(genId<"users">("users"), { _id: clubId }),
    );
    mockGetClubMembershipForUser.mockResolvedValue(membership);

    await expect(validateEventAccess(ctx, event, userId)).resolves.not.toThrow();
  });

  it("should throw for members-only events when user is not a member", async () => {
    const clubId = genId<"clubs">("clubs");
    const userId = genId<"users">("users");
    const event = createTestEventRecord(
      genId<"eventSeries">("eventSeries"),
      clubId,
      genId<"users">("users"),
      Date.now(),
      { visibility: EVENT_VISIBILITY.MEMBERS_ONLY, clubId },
    );

    vi.mocked(ctx.db.get).mockResolvedValue(
      createTestClubRecord(genId<"users">("users"), { _id: clubId }),
    );
    mockGetClubMembershipForUser.mockResolvedValue(null);

    await expect(validateEventAccess(ctx, event, userId)).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
  });
});
