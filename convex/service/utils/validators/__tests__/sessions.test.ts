import {
  END_TIME_AFTER_START_ERROR,
  SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
  SESSION_DATE_FUTURE_ERROR,
  SESSION_DATE_REQUIRED_ONE_TIME_ERROR,
  SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
  SESSION_DAY_OF_MONTH_REQUIRED_ERROR,
  SESSION_DAY_OF_WEEK_REQUIRED_ERROR,
  SESSION_END_DATE_AFTER_START_ERROR,
  SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
  SESSION_START_DATE_FUTURE_ERROR,
  SESSION_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
  SESSION_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
  SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
  SESSION_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
  SESSION_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
  SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
  TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
  TIMESLOT_DURATION_REQUIRED_ERROR,
  TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
  TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
  TIMESLOT_START_END_REQUIRED_ERROR,
  TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
} from "@/convex/constants/errors";
import {
  FEE_TYPE,
  MAX_PARTICIPANTS,
  MAX_SESSION_START_DATE_DAYS_FROM_NOW,
  SESSION_RECURRENCE,
  SESSION_STATUS,
  SESSION_VISIBILITY,
  TIMESLOT_TYPE,
} from "@/convex/constants/sessions";
import { SessionRecurrence } from "@/convex/service/sessions/schemas";
import {
  validateSessionSchedule,
  validateSessionStatusForJoinLeave,
  validateSessionTemplate,
  validateSessionTimeslots,
  validateSessionVisibility,
} from "@/convex/service/utils/validators/sessions";
import { createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import { genId } from "@/test-utils/samples/id";
import {
  createTestSessionInstanceRecord,
  createTestSessionTemplateInput,
  createTestTimeslotTemplate,
} from "@/test-utils/samples/sessions";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("validateSessionVisibility", () => {
  it("should allow public sessions for public clubs", () => {
    const publicClub = createTestClubRecord(genId<"users">("users"), { isPublic: true });

    expect(() => validateSessionVisibility(publicClub, SESSION_VISIBILITY.PUBLIC)).not.toThrow();
  });

  it("should allow members-only sessions for public clubs", () => {
    const publicClub = createTestClubRecord(genId<"users">("users"), { isPublic: true });

    expect(() =>
      validateSessionVisibility(publicClub, SESSION_VISIBILITY.MEMBERS_ONLY),
    ).not.toThrow();
  });

  it("should throw when private club tries to create public session", () => {
    const privateClub = createTestClubRecord(genId<"users">("users"), { isPublic: false });

    expect(() => validateSessionVisibility(privateClub, SESSION_VISIBILITY.PUBLIC)).toThrow(
      SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should allow members-only sessions for private clubs", () => {
    const privateClub = createTestClubRecord(genId<"users">("users"), { isPublic: false });

    expect(() =>
      validateSessionVisibility(privateClub, SESSION_VISIBILITY.MEMBERS_ONLY),
    ).not.toThrow();
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
      const schedule = {
        startTime: "20:00",
        endTime: "18:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
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

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
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

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).not.toThrow();
    });
  });

  describe("ONE_TIME sessions", () => {
    it("should throw when date is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: undefined,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow(
        SESSION_DATE_REQUIRED_ONE_TIME_ERROR,
      );
    });

    it("should throw when date is in the past", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow(
        SESSION_DATE_FUTURE_ERROR,
      );
    });

    it("should throw when date is too far in the future", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + (MAX_SESSION_START_DATE_DAYS_FROM_NOW + 1) * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow(
        SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
      );
    });

    it("should pass when date is valid", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).not.toThrow();
    });

    it("should throw when startDate parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + 24 * 60 * 60 * 1000,
        startDate: Date.now() + 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow();
    });

    it("should throw when endDate parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow();
    });

    it("should throw when dayOfWeek parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + 24 * 60 * 60 * 1000,
        dayOfWeek: 1,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow();
    });

    it("should throw when dayOfMonth parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + 24 * 60 * 60 * 1000,
        dayOfMonth: 15,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.ONE_TIME)).toThrow();
    });

    it("should throw when invalid recurrence provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        date: Date.now() + 24 * 60 * 60 * 1000,
        startDate: Date.now() + 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, "invalid" as SessionRecurrence)).toThrow();
    });
  });

  describe("DAILY sessions", () => {
    it("should throw when start date is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: undefined,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
      );
    });

    it("should throw when end date is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: undefined,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_RECURRING_START_END_DATE_REQUIRED_ERROR,
      );
    });

    it("should throw when start date is in the past", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_START_DATE_FUTURE_ERROR,
      );
    });

    it("should throw when end date is before start date", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_END_DATE_AFTER_START_ERROR,
      );
    });

    it("should throw when start date is too far in the future", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + (MAX_SESSION_START_DATE_DAYS_FROM_NOW + 1) * 24 * 60 * 60 * 1000,
        endDate: Date.now() + (MAX_SESSION_START_DATE_DAYS_FROM_NOW + 30) * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow(
        SESSION_DATE_TOO_FAR_IN_FUTURE_ERROR,
      );
    });

    it("should pass when dates are valid", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).not.toThrow();
    });

    it("should throw when dayOfWeek parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfWeek: 1,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow();
    });

    it("should throw when date parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        date: Date.now() + 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow();
    });

    it("should throw when dayOfMonth parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfMonth: 15,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.DAILY)).toThrow();
    });
  });

  describe("WEEKLY sessions", () => {
    it("should throw when dayOfWeek is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.WEEKLY)).toThrow(
        SESSION_DAY_OF_WEEK_REQUIRED_ERROR,
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

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.WEEKLY)).not.toThrow();
    });

    it("should throw when date parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfWeek: 1,
        date: Date.now() + 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.WEEKLY)).toThrow();
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

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.WEEKLY)).toThrow();
    });
  });

  describe("MONTHLY sessions", () => {
    it("should throw when dayOfMonth is undefined", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.MONTHLY)).toThrow(
        SESSION_DAY_OF_MONTH_REQUIRED_ERROR,
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

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.MONTHLY)).not.toThrow();
    });

    it("should throw when date parameter is provided", () => {
      const schedule = {
        startTime: "18:00",
        endTime: "20:00",
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        dayOfMonth: 15,
        date: Date.now() + 24 * 60 * 60 * 1000,
      };

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.MONTHLY)).toThrow();
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

      expect(() => validateSessionSchedule(schedule, SESSION_RECURRENCE.MONTHLY)).toThrow();
    });
  });
});

describe("validateSessionTimeslots", () => {
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
      const timeslots = [createTestTimeslotTemplate({ duration: undefined })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_DURATION_REQUIRED_ERROR,
      );
    });

    it("should throw when duration exceeds session duration", () => {
      const timeslots = [createTestTimeslotTemplate({ duration: 180 })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_DURATION_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should pass when duration is valid", () => {
      const timeslots = [createTestTimeslotTemplate()];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).not.toThrow();
    });
  });

  describe("START_END timeslots", () => {
    it("should throw when startTime is missing", () => {
      const timeslots = [
        createTestTimeslotTemplate({ type: TIMESLOT_TYPE.START_END, startTime: undefined }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when endTime is missing", () => {
      const timeslots = [
        createTestTimeslotTemplate({ type: TIMESLOT_TYPE.START_END, endTime: undefined }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_START_END_REQUIRED_ERROR,
      );
    });

    it("should throw when timeslot is outside session time range", () => {
      const timeslots = [
        createTestTimeslotTemplate({
          type: TIMESLOT_TYPE.START_END,
          startTime: "17:00",
          endTime: "19:00",
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_TIME_RANGE_NOT_MATCH_SCHEDULE_ERROR,
      );
    });

    it("should throw when timeslot start time is after end time", () => {
      const timeslots = [
        createTestTimeslotTemplate({
          type: TIMESLOT_TYPE.START_END,
          startTime: "19:00",
          endTime: "18:30",
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        END_TIME_AFTER_START_ERROR,
      );
    });

    it("should pass when timeslot times are valid", () => {
      const timeslots = [
        createTestTimeslotTemplate({
          type: TIMESLOT_TYPE.START_END,
          startTime: "18:00",
          endTime: "19:00",
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).not.toThrow();
    });
  });

  describe("permanent participants validation", () => {
    it("should throw when permanent participants exceed max participants", () => {
      const timeslots = [
        createTestTimeslotTemplate({
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

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_PERMANENT_PARTICIPANTS_EXCEEDED_MAX_ERROR,
      );
    });

    it("should throw when permanent participants are not unique", () => {
      const timeslots = [
        createTestTimeslotTemplate({
          permanentParticipants: [user1Id, user2Id, user1Id],
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        SESSION_TIMESLOT_PERMANENT_PARTICIPANTS_NOT_UNIQUE_ERROR,
      );
    });

    it("should throw when permanent participant is not a club member", () => {
      const timeslots = [
        createTestTimeslotTemplate({
          permanentParticipants: [user1Id, genId<"users">("users")],
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        SESSION_TIMESLOT_PERMANENT_PARTICIPANT_NOT_CLUB_MEMBER_ERROR,
      );
    });

    it("should pass when permanent participants are valid", () => {
      const timeslots = [
        createTestTimeslotTemplate({
          permanentParticipants: [user1Id, user2Id],
        }),
      ];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).not.toThrow();
    });
  });

  describe("general validation", () => {
    it("should throw when no timeslots provided", () => {
      expect(() => validateSessionTimeslots(baseSchedule, [], clubMembers)).toThrow(
        SESSION_TIMESLOT_AT_LEAST_ONE_REQUIRED_ERROR,
      );
    });

    it("should throw when maxParticipants is zero", () => {
      const timeslots = [createTestTimeslotTemplate({ maxParticipants: 0 })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
      );
    });

    it("should throw when FIXED fee type missing fee", () => {
      const timeslots = [createTestTimeslotTemplate({ feeType: FEE_TYPE.FIXED, fee: undefined })];

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        SESSION_TIMESLOT_FEE_REQUIRED_FOR_FIXED_ERROR,
      );
    });
  });

  describe("total participants validation", () => {
    it("should throw when total max participants exceed system limit", () => {
      const timeslots = Array.from({ length: 10 }, (_, i) =>
        createTestTimeslotTemplate({
          name: `Slot ${i}`,
          maxParticipants: MAX_PARTICIPANTS / 5,
        }),
      );

      expect(() => validateSessionTimeslots(baseSchedule, timeslots, clubMembers)).toThrow(
        TIMESLOT_MAX_PARTICIPANTS_EXCEEDED_ERROR,
      );
    });
  });
});

describe("validateSessionTemplate", () => {
  it("should validate complete session template successfully", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const sessionTemplate = createTestSessionTemplateInput(club._id);

    expect(() => validateSessionTemplate(sessionTemplate, club, clubMembers)).not.toThrow();
  });

  it("should throw for invalid visibility", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: false });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const sessionTemplate = createTestSessionTemplateInput(club._id, {
      visibility: SESSION_VISIBILITY.PUBLIC,
    });

    expect(() => validateSessionTemplate(sessionTemplate, club, clubMembers)).toThrow(
      SESSION_VISIBILITY_CANNOT_BE_PUBLIC_ERROR,
    );
  });

  it("should throw for invalid schedule", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const sessionTemplate = createTestSessionTemplateInput(club._id, {
      schedule: {
        startTime: "20:00",
        endTime: "18:00", // Invalid: end before start
        startDate: Date.now() + 24 * 60 * 60 * 1000,
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
    });

    expect(() => validateSessionTemplate(sessionTemplate, club, clubMembers)).toThrow(
      END_TIME_AFTER_START_ERROR,
    );
  });

  it("should throw for invalid timeslots", () => {
    const user = createTestUserRecord();
    const club = createTestClubRecord(user._id, { isPublic: true });
    const clubMembers = [createTestClubMembershipRecord(club._id, user._id)];
    const sessionTemplate = createTestSessionTemplateInput(club._id, {
      timeslots: [createTestTimeslotTemplate({ duration: undefined })],
    });

    expect(() => validateSessionTemplate(sessionTemplate, club, clubMembers)).toThrow(
      TIMESLOT_DURATION_REQUIRED_ERROR,
    );
  });
});

describe("validateSessionStatusForJoinLeave", () => {
  it("should pass when session status is NOT_STARTED", () => {
    const session = createTestSessionInstanceRecord(
      genId<"sessionTemplates">("sessionTemplates"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: SESSION_STATUS.NOT_STARTED },
    );

    expect(() => validateSessionStatusForJoinLeave(session)).not.toThrow();
  });

  it("should throw when session status is IN_PROGRESS", () => {
    const session = createTestSessionInstanceRecord(
      genId<"sessionTemplates">("sessionTemplates"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: SESSION_STATUS.IN_PROGRESS },
    );

    expect(() => validateSessionStatusForJoinLeave(session)).toThrow(
      SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });

  it("should throw when session status is COMPLETED", () => {
    const session = createTestSessionInstanceRecord(
      genId<"sessionTemplates">("sessionTemplates"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: SESSION_STATUS.COMPLETED },
    );

    expect(() => validateSessionStatusForJoinLeave(session)).toThrow(
      SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });

  it("should throw when session status is CANCELLED", () => {
    const session = createTestSessionInstanceRecord(
      genId<"sessionTemplates">("sessionTemplates"),
      genId<"clubs">("clubs"),
      Date.now(),
      { status: SESSION_STATUS.CANCELLED },
    );

    expect(() => validateSessionStatusForJoinLeave(session)).toThrow(
      SESSION_CANNOT_JOIN_OR_LEAVE_DUE_TO_STATUS_ERROR,
    );
  });
});
