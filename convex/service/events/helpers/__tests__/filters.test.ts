import { EVENT_STATUS, EVENT_VISIBILITY } from "@/convex/constants/events";
import {
  createEventFilter,
  hasEventAccess,
  matchesClubFilter,
  matchesLevelRange,
  matchesLocationFilter,
  matchesStatusFilter,
  matchesTextSearch,
} from "@/convex/service/events/helpers/filters";
import { createTestEventRecord } from "@/test-utils/samples/events";
import { genId } from "@/test-utils/samples/id";
import { describe, expect, it } from "vitest";

// Fixed timestamp for consistent test data
const FIXED_DATE = 1704067200000; // 2024-01-01T00:00:00.000Z

// Test ID constants
const TEST_CLUB_ID = genId<"clubs">("clubs1");
const TEST_USER_ID = genId<"users">("users");
const OTHER_CLUB_ID = genId<"clubs">("clubs2");
const OTHER_CLUB_ID_2 = genId<"clubs">("clubs3");

describe("Event Filters", () => {
  const baseEvent = createTestEventRecord(TEST_CLUB_ID, TEST_USER_ID, FIXED_DATE, {
    name: "Test Event",
    description: "Test Description",
    location: {
      name: "Test Location",
      address: "123 Test St",
      placeId: "place123",
      timezone: "Australia/Sydney",
    },
    levelRange: { min: 3, max: 7 },
    visibility: EVENT_VISIBILITY.PUBLIC,
    status: EVENT_STATUS.NOT_STARTED,
  });

  describe("hasEventAccess", () => {
    it("allows access to public events for any user", () => {
      const event = { ...baseEvent, visibility: EVENT_VISIBILITY.PUBLIC };
      expect(hasEventAccess(event, [])).toBe(true);
      expect(hasEventAccess(event, [OTHER_CLUB_ID])).toBe(true);
    });

    it("denies access to members-only events for non-members", () => {
      const event = { ...baseEvent, visibility: EVENT_VISIBILITY.MEMBERS_ONLY };
      expect(hasEventAccess(event, [])).toBe(false);
      expect(hasEventAccess(event, [OTHER_CLUB_ID])).toBe(false);
    });

    it("allows access to members-only events for club members", () => {
      const event = { ...baseEvent, visibility: EVENT_VISIBILITY.MEMBERS_ONLY };
      expect(hasEventAccess(event, [event.clubId])).toBe(true);
      expect(hasEventAccess(event, [OTHER_CLUB_ID, event.clubId])).toBe(true);
    });
  });

  describe("matchesClubFilter", () => {
    it("returns true when no club filter is provided", () => {
      expect(matchesClubFilter(baseEvent)).toBe(true);
      expect(matchesClubFilter(baseEvent, undefined)).toBe(true);
    });

    it("returns true when event club is in filter list", () => {
      expect(matchesClubFilter(baseEvent, [baseEvent.clubId])).toBe(true);
      expect(matchesClubFilter(baseEvent, [OTHER_CLUB_ID, baseEvent.clubId])).toBe(true);
    });

    it("returns false when event club is not in filter list", () => {
      expect(matchesClubFilter(baseEvent, [OTHER_CLUB_ID])).toBe(false);
      expect(matchesClubFilter(baseEvent, [OTHER_CLUB_ID, OTHER_CLUB_ID_2])).toBe(false);
    });

    it("returns false for empty club filter array", () => {
      expect(matchesClubFilter(baseEvent, [])).toBe(false);
    });
  });

  describe("matchesLevelRange", () => {
    it("returns true when no level range filter is provided", () => {
      expect(matchesLevelRange(baseEvent)).toBe(true);
      expect(matchesLevelRange(baseEvent, undefined)).toBe(true);
      expect(matchesLevelRange(baseEvent, {})).toBe(true);
    });

    it("filters by minimum level correctly", () => {
      const event = { ...baseEvent, levelRange: { min: 3, max: 7 } };

      expect(matchesLevelRange(event, { min: 1 })).toBe(true); // 7 >= 1
      expect(matchesLevelRange(event, { min: 7 })).toBe(true); // 7 >= 7
      expect(matchesLevelRange(event, { min: 8 })).toBe(false); // 7 < 8
    });

    it("filters by maximum level correctly", () => {
      const event = { ...baseEvent, levelRange: { min: 3, max: 7 } };

      expect(matchesLevelRange(event, { max: 10 })).toBe(true); // 3 <= 10
      expect(matchesLevelRange(event, { max: 3 })).toBe(true); // 3 <= 3
      expect(matchesLevelRange(event, { max: 2 })).toBe(false); // 3 > 2
    });

    it("filters by level range overlap correctly", () => {
      const event = { ...baseEvent, levelRange: { min: 3, max: 7 } };

      expect(matchesLevelRange(event, { min: 1, max: 10 })).toBe(true); // overlaps
      expect(matchesLevelRange(event, { min: 5, max: 9 })).toBe(true); // overlaps
      expect(matchesLevelRange(event, { min: 1, max: 5 })).toBe(true); // overlaps
      expect(matchesLevelRange(event, { min: 8, max: 10 })).toBe(false); // no overlap
      expect(matchesLevelRange(event, { min: 1, max: 2 })).toBe(false); // no overlap
    });
  });

  describe("matchesLocationFilter", () => {
    it("returns true when no location filter is provided", () => {
      expect(matchesLocationFilter(baseEvent)).toBe(true);
      expect(matchesLocationFilter(baseEvent, undefined)).toBe(true);
    });

    it("matches place IDs case-insensitively", () => {
      const event = { ...baseEvent, location: { ...baseEvent.location, placeId: "Place123" } };

      expect(matchesLocationFilter(event, "place123")).toBe(true);
      expect(matchesLocationFilter(event, "PLACE123")).toBe(true);
      expect(matchesLocationFilter(event, "Place123")).toBe(true);
    });

    it("returns false when place IDs don't match", () => {
      const event = { ...baseEvent, location: { ...baseEvent.location, placeId: "place123" } };

      expect(matchesLocationFilter(event, "place456")).toBe(false);
      expect(matchesLocationFilter(event, "different-place")).toBe(false);
    });

    it("handles empty string place ID filter", () => {
      expect(matchesLocationFilter(baseEvent, "")).toBe(true);
    });
  });

  describe("matchesTextSearch", () => {
    it("returns true when no query is provided", () => {
      expect(matchesTextSearch(baseEvent)).toBe(true);
      expect(matchesTextSearch(baseEvent, undefined)).toBe(true);
      expect(matchesTextSearch(baseEvent, "")).toBe(true);
    });

    it("searches event name case-insensitively", () => {
      const event = { ...baseEvent, name: "Tennis Tournament" };

      expect(matchesTextSearch(event, "tennis")).toBe(true);
      expect(matchesTextSearch(event, "TENNIS")).toBe(true);
      expect(matchesTextSearch(event, "Tournament")).toBe(true);
      expect(matchesTextSearch(event, "tennis tournament")).toBe(true);
    });

    it("searches event description case-insensitively", () => {
      const event = { ...baseEvent, name: "Event", description: "Indoor Tennis Court" };

      expect(matchesTextSearch(event, "indoor")).toBe(true);
      expect(matchesTextSearch(event, "TENNIS")).toBe(true);
      expect(matchesTextSearch(event, "court")).toBe(true);
    });

    it("returns false when query doesn't match name or description", () => {
      const event = { ...baseEvent, name: "Basketball Game", description: "Outdoor court" };

      expect(matchesTextSearch(event, "tennis")).toBe(false);
      expect(matchesTextSearch(event, "swimming")).toBe(false);
    });

    it("handles events with undefined description", () => {
      const event = { ...baseEvent, name: "Tennis Match", description: undefined };

      expect(matchesTextSearch(event, "tennis")).toBe(true); // matches name
      expect(matchesTextSearch(event, "description")).toBe(false); // no description to match
    });
  });

  describe("matchesStatusFilter", () => {
    it("returns true when no status filter is provided", () => {
      expect(matchesStatusFilter(baseEvent)).toBe(true);
      expect(matchesStatusFilter(baseEvent, undefined)).toBe(true);
      expect(matchesStatusFilter(baseEvent, [])).toBe(true);
    });

    it("returns true when event status is in filter array", () => {
      const event = { ...baseEvent, status: EVENT_STATUS.NOT_STARTED };
      expect(matchesStatusFilter(event, [EVENT_STATUS.NOT_STARTED])).toBe(true);
      expect(matchesStatusFilter(event, [EVENT_STATUS.NOT_STARTED, EVENT_STATUS.IN_PROGRESS])).toBe(true);
    });

    it("returns false when event status is not in filter array", () => {
      const event = { ...baseEvent, status: EVENT_STATUS.NOT_STARTED };
      expect(matchesStatusFilter(event, [EVENT_STATUS.COMPLETED])).toBe(false);
      expect(matchesStatusFilter(event, [EVENT_STATUS.IN_PROGRESS, EVENT_STATUS.CANCELLED])).toBe(false);
    });

    it("handles all event statuses correctly", () => {
      const notStartedEvent = { ...baseEvent, status: EVENT_STATUS.NOT_STARTED };
      const inProgressEvent = { ...baseEvent, status: EVENT_STATUS.IN_PROGRESS };
      const completedEvent = { ...baseEvent, status: EVENT_STATUS.COMPLETED };
      const cancelledEvent = { ...baseEvent, status: EVENT_STATUS.CANCELLED };

      const allStatuses = [EVENT_STATUS.NOT_STARTED, EVENT_STATUS.IN_PROGRESS, EVENT_STATUS.COMPLETED, EVENT_STATUS.CANCELLED];
      
      expect(matchesStatusFilter(notStartedEvent, allStatuses)).toBe(true);
      expect(matchesStatusFilter(inProgressEvent, allStatuses)).toBe(true);
      expect(matchesStatusFilter(completedEvent, allStatuses)).toBe(true);
      expect(matchesStatusFilter(cancelledEvent, allStatuses)).toBe(true);
    });
  });

  describe("createEventFilter", () => {
    it("combines all filters correctly for matching event", () => {
      const filters = {
        fromDate: FIXED_DATE - 86400000,
        toDate: FIXED_DATE + 86400000,
        clubIds: [baseEvent.clubId],
        levelRange: { min: 3, max: 7 },
        placeId: "place123",
        query: "test",
        status: [EVENT_STATUS.NOT_STARTED],
      };
      const userMemberClubIds = [baseEvent.clubId];

      const filterFn = createEventFilter(filters, userMemberClubIds);
      expect(filterFn(baseEvent)).toBe(true);
    });

    it("rejects events that fail any filter", () => {
      const filters = {
        fromDate: FIXED_DATE - 86400000,
        toDate: FIXED_DATE + 86400000,
        clubIds: [baseEvent.clubId],
        levelRange: { min: 3, max: 7 },
        placeId: "place123",
        query: "test",
        status: [EVENT_STATUS.NOT_STARTED],
      };
      const userMemberClubIds = [baseEvent.clubId];

      // Test each filter failure
      const filterFn1 = createEventFilter({ ...filters, query: "nonexistent" }, userMemberClubIds);
      expect(filterFn1(baseEvent)).toBe(false); // text search fails

      const filterFn2 = createEventFilter(
        { ...filters, clubIds: [OTHER_CLUB_ID] },
        userMemberClubIds,
      );
      expect(filterFn2(baseEvent)).toBe(false); // club filter fails

      const filterFn3 = createEventFilter(
        { ...filters, levelRange: { min: 1, max: 2 } },
        userMemberClubIds,
      );
      expect(filterFn3(baseEvent)).toBe(false); // level range fails

      const filterFn4 = createEventFilter(
        { ...filters, placeId: "other-place" },
        userMemberClubIds,
      );
      expect(filterFn4(baseEvent)).toBe(false); // location filter fails

      const filterFn5 = createEventFilter(
        { ...filters, status: [EVENT_STATUS.COMPLETED] },
        userMemberClubIds,
      );
      expect(filterFn5(baseEvent)).toBe(false); // status filter fails
    });

    it("handles members-only events correctly", () => {
      const membersEvent = { ...baseEvent, visibility: EVENT_VISIBILITY.MEMBERS_ONLY };
      const filters = {
        fromDate: FIXED_DATE - 86400000,
        toDate: FIXED_DATE + 86400000,
      };

      const filterFn1 = createEventFilter(filters, [baseEvent.clubId]);
      expect(filterFn1(membersEvent)).toBe(true); // user is member

      const filterFn2 = createEventFilter(filters, []);
      expect(filterFn2(membersEvent)).toBe(false); // user is not member
    });

    it("works with minimal filters", () => {
      const filters = {
        fromDate: FIXED_DATE - 86400000,
        toDate: FIXED_DATE + 86400000,
      };

      const filterFn = createEventFilter(filters, []);
      expect(filterFn(baseEvent)).toBe(true); // public event with no additional filters
    });
  });
});
