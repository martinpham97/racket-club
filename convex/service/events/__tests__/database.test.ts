import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { EVENT_STATUS, FEE_TYPE, TIMESLOT_TYPE } from "@/convex/constants/events";
import {
  createEvent,
  createEventSeries,
  getEventAtDate,
  listAllEventParticipants,
  listEventParticipationsForUser,
  listEventSeriesForClub,
  listEventsForClub,
  listParticipatingEvents,
} from "@/convex/service/events/database";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import {
  createTestEventParticipantRecord,
  createTestEventRecord,
  createTestEventSeriesInput,
  createTestEventSeriesRecord,
} from "@/test-utils/samples/events";
import { genId } from "@/test-utils/samples/id";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMockAuthCtx = (): AuthenticatedWithProfileCtx =>
  ({
    ...createMockCtx<QueryCtx>(),
    currentUser: createTestUserRecord(),
  }) as unknown as AuthenticatedWithProfileCtx;

describe("Events Database Service", () => {
  let mockCtx: QueryCtx;
  let mockMutationCtx: MutationCtx;

  beforeEach(() => {
    mockCtx = createMockCtx();
    mockMutationCtx = createMockCtx();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("listEventSeriesForClub", () => {
    it("returns paginated event seriess for a club", async () => {
      const clubId = genId<"clubs">("clubs");
      const pagination = { cursor: null, numItems: 10 };
      const series = createTestEventSeriesRecord(clubId, genId<"users">("users"));
      const paginatedResult = { page: [series], isDone: true, continueCursor: null };

      const mockPaginate = vi.fn().mockResolvedValueOnce(paginatedResult);
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { paginate: mockPaginate };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listEventSeriesForClub(mockCtx, clubId, pagination);

      expect(result).toEqual(paginatedResult);
      expect(mockCtx.db.query).toHaveBeenCalledWith("eventSeries");
      expect(mockWithIndex).toHaveBeenCalledWith("clubId", expect.any(Function));
    });
  });

  describe("listEventsForClub", () => {
    it("returns paginated events for a club within date range", async () => {
      const clubId = genId<"clubs">("clubs");
      const seriesId = genId<"eventSeries">("eventSeries");
      const filters = { fromDate: Date.now() - 86400000, toDate: Date.now() + 86400000 };
      const pagination = { cursor: null, numItems: 10 };
      const event = createTestEventRecord(seriesId, clubId, Date.now());
      const paginatedResult = { page: [event], isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          order: vi.fn(() => ({
            paginate: vi.fn().mockResolvedValueOnce(paginatedResult),
          })),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listEventsForClub(mockCtx, clubId, filters, pagination);

      expect(result).toEqual(paginatedResult);
      expect(mockCtx.db.query).toHaveBeenCalledWith("events");
      expect(mockQuery.withIndex).toHaveBeenCalledWith("clubIdDate", expect.any(Function));
    });

    it("executes the complete query chain including order and return", async () => {
      const clubId = genId<"clubs">("clubs");
      const filters = { fromDate: Date.now() - 86400000, toDate: Date.now() + 86400000 };
      const pagination = { cursor: null, numItems: 10 };
      const event = createTestEventRecord(genId<"eventSeries">("eventSeries"), clubId, Date.now());
      const paginatedResult = { page: [event], isDone: true, continueCursor: null };

      const mockPaginate = vi.fn().mockResolvedValueOnce(paginatedResult);
      const mockOrder = vi.fn(() => ({ paginate: mockPaginate }));
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { order: mockOrder };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listEventsForClub(mockCtx, clubId, filters, pagination);

      expect(mockWithIndex).toHaveBeenCalledWith("clubIdDate", expect.any(Function));
      expect(mockOrder).toHaveBeenCalledWith("asc");
      expect(mockPaginate).toHaveBeenCalledWith(pagination);
      expect(result).toBe(paginatedResult);
    });
  });

  describe("listParticipatingEvents", () => {
    it("returns event with participation details for a user", async () => {
      const userId = genId<"users">("users");
      const eventId = genId<"events">("events");
      const seriesId = genId<"eventSeries">("eventSeries");
      const clubId = genId<"clubs">("clubs");
      const date = Date.now();
      const filters = { fromDate: date - 86400000, toDate: date + 86400000 };
      const pagination = { cursor: null, numItems: 10 };

      const participation = createTestEventParticipantRecord(eventId, userId, "timeslot-1", date);
      const event = createTestEventRecord(seriesId, clubId, date);
      const participationResult = { page: [participation], isDone: true, continueCursor: null };

      const mockPaginate = vi.fn().mockResolvedValueOnce(participationResult);
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { paginate: mockPaginate };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(event);

      const result = await listParticipatingEvents(mockCtx, userId, filters, pagination);

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual({ ...event, participation });
      expect(mockCtx.db.query).toHaveBeenCalledWith("eventParticipants");
      expect(mockCtx.db.get).toHaveBeenCalledWith(eventId);
    });

    it("filters out events that no longer exist", async () => {
      const userId = genId<"users">("users");
      const eventId = genId<"events">("events");
      const date = Date.now();
      const filters = { fromDate: date - 86400000, toDate: date + 86400000 };
      const pagination = { cursor: null, numItems: 10 };

      const participation = createTestEventParticipantRecord(eventId, userId, "timeslot-1", date);
      const participationResult = { page: [participation], isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          paginate: vi.fn().mockResolvedValueOnce(participationResult),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(null);

      const result = await listParticipatingEvents(mockCtx, userId, filters, pagination);

      expect(result.page).toHaveLength(0);
    });

    it("processes event promises and filters null results correctly", async () => {
      const userId = genId<"users">("users");
      const eventId1 = genId<"events">("events");
      const eventId2 = genId<"events">("events");
      const seriesId = genId<"eventSeries">("eventSeries");
      const clubId = genId<"clubs">("clubs");
      const date = Date.now();
      const filters = { fromDate: date - 86400000, toDate: date + 86400000 };
      const pagination = { cursor: null, numItems: 10 };

      const participation1 = createTestEventParticipantRecord(eventId1, userId, "timeslot-1", date);
      const participation2 = createTestEventParticipantRecord(eventId2, userId, "timeslot-1", date);
      const event = createTestEventRecord(seriesId, clubId, date);
      const participationResult = {
        page: [participation1, participation2],
        isDone: true,
        continueCursor: null,
      };

      const mockPaginate = vi.fn().mockResolvedValueOnce(participationResult);
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { paginate: mockPaginate };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      // Mock db.get to return valid event for first call, null for second
      vi.mocked(mockCtx.db.get)
        .mockImplementationOnce(async (id) => {
          if (id === eventId1) return event;
          return null;
        })
        .mockImplementationOnce(async (id) => {
          if (id === eventId2) return null;
          return event;
        });

      const result = await listParticipatingEvents(mockCtx, userId, filters, pagination);

      // Verify the Promise.all and filter operations executed
      expect(mockCtx.db.get).toHaveBeenCalledTimes(2);
      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual({ ...event, participation: participation1 });
      expect(result.isDone).toBe(true);
      expect(result.continueCursor).toBeNull();
    });
  });

  describe("listEventParticipationsForUser", () => {
    it("returns all participation records for a user in a event", async () => {
      const eventId = genId<"events">("events");
      const userId = genId<"users">("users");
      const participation1 = createTestEventParticipantRecord(
        eventId,
        userId,
        "timeslot-1",
        Date.now(),
      );
      const participation2 = createTestEventParticipantRecord(
        eventId,
        userId,
        "timeslot-2",
        Date.now(),
      );

      const mockCollect = vi.fn().mockResolvedValueOnce([participation1, participation2]);
      const mockWithIndex = vi.fn((indexName, callback) => {
        // Execute the callback to cover the query builder chain
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { collect: mockCollect };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listEventParticipationsForUser(mockCtx, eventId, userId);

      expect(result).toEqual([participation1, participation2]);
      expect(mockCtx.db.query).toHaveBeenCalledWith("eventParticipants");
      expect(mockWithIndex).toHaveBeenCalledWith("eventUser", expect.any(Function));
      expect(mockCollect).toHaveBeenCalled();
    });
  });

  describe("listAllEventParticipants", () => {
    it("returns all participants for a event", async () => {
      const eventId = genId<"events">("events");
      const userId1 = genId<"users">("users");
      const userId2 = genId<"users">("users");
      const participation1 = createTestEventParticipantRecord(
        eventId,
        userId1,
        "timeslot-1",
        Date.now(),
      );
      const participation2 = createTestEventParticipantRecord(
        eventId,
        userId2,
        "timeslot-1",
        Date.now(),
      );

      const mockQuery = {
        withIndex: vi.fn(() => ({
          collect: vi.fn().mockResolvedValueOnce([participation1, participation2]),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listAllEventParticipants(mockCtx, eventId);

      expect(result).toEqual([participation1, participation2]);
      expect(mockCtx.db.query).toHaveBeenCalledWith("eventParticipants");
      expect(mockQuery.withIndex).toHaveBeenCalledWith("eventId", expect.any(Function));
    });

    it("executes collect operation and returns result directly", async () => {
      const eventId = genId<"events">("events");
      const participants = [
        createTestEventParticipantRecord(
          eventId,
          genId<"users">("users"),
          "timeslot-1",
          Date.now(),
        ),
      ];

      const mockCollect = vi.fn().mockResolvedValueOnce(participants);
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { collect: mockCollect };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listAllEventParticipants(mockCtx, eventId);

      expect(mockCtx.db.query).toHaveBeenCalledWith("eventParticipants");
      expect(mockWithIndex).toHaveBeenCalledWith("eventId", expect.any(Function));
      expect(mockCollect).toHaveBeenCalled();
      expect(result).toBe(participants);
    });
  });

  describe("getEventAtDate", () => {
    it("returns event when found for series and date", async () => {
      const seriesId = genId<"eventSeries">("eventSeries");
      const clubId = genId<"clubs">("clubs");
      const date = Date.now();
      const event = createTestEventRecord(seriesId, clubId, date);

      const mockFirst = vi.fn().mockResolvedValueOnce(event);
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { first: mockFirst };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await getEventAtDate(mockCtx, seriesId, date);

      expect(result).toEqual(event);
      expect(mockCtx.db.query).toHaveBeenCalledWith("events");
      expect(mockWithIndex).toHaveBeenCalledWith("eventSeriesDate", expect.any(Function));
    });

    it("returns null when event not found", async () => {
      const seriesId = genId<"eventSeries">("eventSeries");
      const date = Date.now();

      const mockFirst = vi.fn().mockResolvedValueOnce(null);
      const mockWithIndex = vi.fn((indexName, callback) => {
        const mockQueryBuilder = {
          eq: vi.fn().mockReturnThis(),
        };
        callback(mockQueryBuilder);
        return { first: mockFirst };
      });
      const mockQuery = { withIndex: mockWithIndex };

      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await getEventAtDate(mockCtx, seriesId, date);

      expect(result).toBeNull();
    });
  });

  describe("createEventSeries", () => {
    it("creates event series with correct automatic fields", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const input = createTestEventSeriesInput(clubId);
      const seriesId = genId<"eventSeries">("eventSeries");

      vi.mocked(mockCtx.db.insert).mockResolvedValueOnce(seriesId);

      const result = await createEventSeries(mockCtx, input);

      expect(result).toBe(seriesId);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("eventSeries", {
        ...input,
        createdBy: mockCtx.currentUser._id,
        createdAt: expect.any(Number),
        modifiedAt: expect.any(Number),
      });
    });
  });

  describe("createEvent", () => {
    it("creates event with correct automatic fields", async () => {
      const clubId = genId<"clubs">("clubs");
      const seriesId = genId<"eventSeries">("eventSeries");
      const date = Date.now();
      const input = { ...createTestEventSeriesInput(clubId), createdAt: Date.now() };
      const eventId = genId<"events">("events");

      vi.mocked(mockMutationCtx.db.insert).mockResolvedValueOnce(eventId);

      const result = await createEvent(mockMutationCtx, input, seriesId, date);

      expect(result).toBe(eventId);
      expect(mockMutationCtx.db.insert).toHaveBeenCalledWith("events", {
        clubId: input.clubId,
        name: input.name,
        description: input.description,
        location: input.location,
        type: input.type,
        schedule: input.schedule,
        paymentType: input.paymentType,
        visibility: input.visibility,
        levelRange: input.levelRange,
        createdAt: input.createdAt,
        eventSeriesId: seriesId,
        timeslots: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            numParticipants: 0,
            numWaitlisted: 0,
          }),
        ]),
        date,
        status: EVENT_STATUS.NOT_STARTED,
      });
    });

    it("initializes timeslot participant counts correctly", async () => {
      const clubId = genId<"clubs">("clubs");
      const seriesId = genId<"eventSeries">("eventSeries");
      const date = Date.now();
      const userId1 = genId<"users">("users");
      const userId2 = genId<"users">("users");
      const input = {
        ...createTestEventSeriesInput(clubId, {
          timeslots: [
            {
              name: "Court 1",
              type: TIMESLOT_TYPE.DURATION,
              duration: 60,
              feeType: FEE_TYPE.FIXED,
              fee: 25,
              maxParticipants: 4,
              maxWaitlist: 4,
              permanentParticipants: [userId1, userId2],
            },
          ],
        }),
        createdAt: Date.now(),
      };
      const eventId = genId<"events">("events");

      vi.mocked(mockMutationCtx.db.insert).mockResolvedValueOnce(eventId);

      await createEvent(mockMutationCtx, input, seriesId, date);

      const insertCall = vi.mocked(mockMutationCtx.db.insert).mock.calls[0];
      const insertedData = insertCall[1] as Record<string, unknown>;

      expect((insertedData.timeslots as unknown[])[0]).toMatchObject({
        numParticipants: 2, // Length of permanentParticipants
        numWaitlisted: 0,
        id: expect.any(String),
      });
    });

    it("executes complete creation with schema parsing and timeslot mapping", async () => {
      const clubId = genId<"clubs">("clubs");
      const seriesId = genId<"eventSeries">("eventSeries");
      const date = Date.now();
      const userId1 = genId<"users">("users");
      const input = {
        ...createTestEventSeriesInput(clubId, {
          timeslots: [
            {
              name: "Court 1",
              type: TIMESLOT_TYPE.DURATION,
              duration: 60,
              feeType: FEE_TYPE.FIXED,
              fee: 25,
              maxParticipants: 4,
              maxWaitlist: 4,
              permanentParticipants: [userId1],
            },
          ],
        }),
        createdAt: Date.now(),
      };
      const eventId = genId<"events">("events");

      vi.mocked(mockMutationCtx.db.insert).mockImplementationOnce(async (table, data) => {
        // Verify the complete data structure is created correctly
        expect(table).toBe("events");
        expect(data).toMatchObject({
          eventSeriesId: seriesId,
          date,
          status: EVENT_STATUS.NOT_STARTED,
          timeslots: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              numParticipants: 1, // permanentParticipants.length
              numWaitlisted: 0,
              name: "Court 1",
            }),
          ]),
        });
        return eventId;
      });

      const result = await createEvent(mockMutationCtx, input, seriesId, date);

      expect(result).toBe(eventId);
      expect(mockMutationCtx.db.insert).toHaveBeenCalledTimes(1);
    });
  });
});
