import { Id } from "@/convex/_generated/dataModel";
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
import schema from "@/convex/schema";
import { ClubMembership } from "@/convex/service/clubs/schemas";
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
import { convexTest } from "@/convex/setup.testing";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import {
  createTestEvent,
  createTestEventInput,
  createTestEventSeries,
  createTestEventSeriesInput,
  createTestTimeslotInput,
  EventTestHelpers,
} from "@/test-utils/samples/events";
import { genId } from "@/test-utils/samples/id";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
  });

  it("should allow public events for public clubs", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const publicClub = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));

    expect(() => validateEventVisibility(publicClub, EVENT_VISIBILITY.PUBLIC)).not.toThrow();
  });

  it("should allow members-only events for public clubs", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const publicClub = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));

    expect(() => validateEventVisibility(publicClub, EVENT_VISIBILITY.MEMBERS_ONLY)).not.toThrow();
  });

  it("should throw when private club tries to create public event", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const privateClub = await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));

    expect(() => validateEventVisibility(privateClub, EVENT_VISIBILITY.PUBLIC)).toThrow(
      EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should allow members-only events for private clubs", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const privateClub = await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));

    expect(() => validateEventVisibility(privateClub, EVENT_VISIBILITY.MEMBERS_ONLY)).not.toThrow();
  });
});

describe("validateEventTimeslots", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let startTime: string;
  let endTime: string;
  let clubMembers: ClubMembership[];
  let user1Id: Id<"users">;
  let user2Id: Id<"users">;
  let user3Id: Id<"users">;

  beforeEach(async () => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    startTime = "18:00";
    endTime = "20:00";

    const user1 = await userHelpers.insertUser("user1@test.com");
    user1Id = user1._id;
    const user2 = await userHelpers.insertUser("user2@test.com");
    user2Id = user2._id;
    const user3 = await userHelpers.insertUser("user3@test.com");
    user3Id = user3._id;
    const clubOwner = await userHelpers.insertUser("owner@test.com");
    const club = await clubHelpers.insertClub(createTestClub(clubOwner._id));
    const clubId = club._id;

    const membership1 = await clubHelpers.insertMembership(
      createTestClubMembership(clubId, user1Id),
    );
    const membership2 = await clubHelpers.insertMembership(
      createTestClubMembership(clubId, user2Id),
    );
    const membership3 = await clubHelpers.insertMembership(
      createTestClubMembership(clubId, user3Id),
    );
    clubMembers = [membership1, membership2, membership3];
  });

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
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should validate single event successfully", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
    const clubId = club._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));
    const event = createTestEventInput(clubId, {
      date: Date.now() + ONE_DAY_MS,
      startTime: "18:00",
      endTime: "20:00",
    });

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventForCreate(ctx, event, club)).resolves.not.toThrow();
    });
  });
});

describe("validateEventSeriesForCreate", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
  });

  it("should validate complete event series successfully", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
    const clubId = club._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));
    const eventSeries = createTestEventSeriesInput(clubId);

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).resolves.not.toThrow();
    });
  });

  it("should throw for invalid visibility", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));
    const clubId = club._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));
    const eventSeries = createTestEventSeriesInput(clubId, {
      visibility: EVENT_VISIBILITY.PUBLIC,
    });

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).rejects.toThrow(
        EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
      );
    });
  });

  it("should throw for invalid timeslots", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
    const clubId = club._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));
    const eventSeries = createTestEventSeriesInput(clubId, {
      timeslots: [createTestTimeslotInput({ duration: undefined })],
    });

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventSeriesForCreate(ctx, eventSeries, club)).rejects.toThrow(
        TIMESLOT_DURATION_REQUIRED_ERROR,
      );
    });
  });
});

describe("validateEventStatusForJoinLeave", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let _eventHelpers: EventTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    _eventHelpers = new EventTestHelpers(t);
  });

  it("should pass when event status is NOT_STARTED", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const event = await _eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        status: EVENT_STATUS.NOT_STARTED,
      }),
    );

    expect(() => validateEventStatusForJoinLeave(event)).not.toThrow();
  });

  it("should throw when event status is IN_PROGRESS", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const event = await _eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        status: EVENT_STATUS.IN_PROGRESS,
      }),
    );

    expect(() => validateEventStatusForJoinLeave(event)).toThrow(
      EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });

  it("should throw when event status is COMPLETED", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const event = await _eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        status: EVENT_STATUS.COMPLETED,
      }),
    );

    expect(() => validateEventStatusForJoinLeave(event)).toThrow(
      EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });

  it("should throw when event status is CANCELLED", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const event = await _eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        status: EVENT_STATUS.CANCELLED,
      }),
    );

    expect(() => validateEventStatusForJoinLeave(event)).toThrow(
      EVENT_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });
});

describe("validateEventSeriesForUpdate", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let eventHelpers: EventTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    eventHelpers = new EventTestHelpers(t);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should validate partial update successfully", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
    const clubId = club._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));
    const existingEventSeries = await eventHelpers.insertEventSeries(
      createTestEventSeries(clubId, userId),
    );
    const updateInput = { visibility: EVENT_VISIBILITY.MEMBERS_ONLY };

    await t.runWithCtx(async (ctx) => {
      await expect(
        validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
      ).resolves.not.toThrow();
    });
  });

  it("should throw for invalid visibility update", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));
    const clubId = club._id;
    const existingEventSeries = await eventHelpers.insertEventSeries(
      createTestEventSeries(clubId, userId),
    );
    const updateInput = { visibility: EVENT_VISIBILITY.PUBLIC };

    await t.runWithCtx(async (ctx) => {
      await expect(
        validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
      ).rejects.toThrow(EVENT_VISIBILITY_CANNOT_BE_PUBLIC_ERROR);
    });
  });

  it("should validate timeslots update with existing schedule", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
    const clubId = club._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));
    const existingEventSeries = await eventHelpers.insertEventSeries(
      createTestEventSeries(clubId, userId),
    );
    const updateInput = { timeslots: [createTestTimeslotInput()] };

    await t.runWithCtx(async (ctx) => {
      await expect(
        validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
      ).resolves.not.toThrow();
    });
  });

  it("should validate schedule and recurrence update together", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId, { isPublic: true }));
    const clubId = club._id;
    const existingEventSeries = await eventHelpers.insertEventSeries(
      createTestEventSeries(clubId, userId),
    );
    const updateInput = {
      schedule: {
        startDate: Date.now() + 2 * ONE_DAY_MS,
        endDate: Date.now() + SIXTY_DAYS_MS,
        daysOfWeek: [1, 2, 3],
        interval: 1,
      },
    };

    await t.runWithCtx(async (ctx) => {
      await expect(
        validateEventSeriesForUpdate(ctx, club, existingEventSeries, updateInput),
      ).resolves.not.toThrow();
    });
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
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let eventHelpers: EventTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    eventHelpers = new EventTestHelpers(t);
  });

  it("should pass for public events", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const event = await eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        visibility: EVENT_VISIBILITY.PUBLIC,
      }),
    );
    const otherUser = await userHelpers.insertUser("other@test.com");
    const otherUserId = otherUser._id;

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventAccess(ctx, event, otherUserId)).resolves.not.toThrow();
    });
  });

  it("should pass for members-only events when user is a member", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const memberUser = await userHelpers.insertUser("member@test.com");
    const memberUserId = memberUser._id;
    await clubHelpers.insertMembership(createTestClubMembership(clubId, memberUserId));
    const event = await eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        visibility: EVENT_VISIBILITY.MEMBERS_ONLY,
      }),
    );

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventAccess(ctx, event, memberUserId)).resolves.not.toThrow();
    });
  });

  it("should throw for members-only events when user is not a member", async () => {
    const user = await userHelpers.insertUser();
    const userId = user._id;
    const club = await clubHelpers.insertClub(createTestClub(userId));
    const clubId = club._id;
    const nonMemberUser = await userHelpers.insertUser("nonmember@test.com");
    const nonMemberUserId = nonMemberUser._id;
    const event = await eventHelpers.insertEvent(
      createTestEvent(clubId, userId, Date.now(), {
        visibility: EVENT_VISIBILITY.MEMBERS_ONLY,
      }),
    );

    await t.runWithCtx(async (ctx) => {
      await expect(validateEventAccess(ctx, event, nonMemberUserId)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );
    });
  });
});
