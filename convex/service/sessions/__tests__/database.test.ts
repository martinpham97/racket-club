import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { FEE_TYPE, SESSION_STATUS, TIMESLOT_TYPE } from "@/convex/constants/sessions";
import {
  createSessionInstance,
  createSessionTemplate,
  getSessionInstanceAtDate,
  listAllSessionParticipants,
  listParticipatingSessionInstances,
  listSessionInstancesForClub,
  listSessionParticipationsForUser,
  listSessionTemplatesForClub,
} from "@/convex/service/sessions/database";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { genId } from "@/test-utils/samples/id";
import {
  createTestSessionInstanceRecord,
  createTestSessionParticipantRecord,
  createTestSessionTemplateInput,
  createTestSessionTemplateRecord,
} from "@/test-utils/samples/sessions";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMockAuthCtx = (): AuthenticatedWithProfileCtx =>
  ({
    ...createMockCtx<QueryCtx>(),
    currentUser: createTestUserRecord(),
  }) as unknown as AuthenticatedWithProfileCtx;

describe("Sessions Database Service", () => {
  let mockCtx: QueryCtx;
  let mockMutationCtx: MutationCtx;

  beforeEach(() => {
    mockCtx = createMockCtx();
    mockMutationCtx = createMockCtx();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("listSessionTemplatesForClub", () => {
    it("returns paginated session templates for a club", async () => {
      const clubId = genId<"clubs">("clubs");
      const pagination = { cursor: null, numItems: 10 };
      const template = createTestSessionTemplateRecord(clubId, genId<"users">("users"));
      const paginatedResult = { page: [template], isDone: true, continueCursor: null };

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

      const result = await listSessionTemplatesForClub(mockCtx, clubId, pagination);

      expect(result).toEqual(paginatedResult);
      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionTemplates");
      expect(mockWithIndex).toHaveBeenCalledWith("clubId", expect.any(Function));
    });
  });

  describe("listSessionInstancesForClub", () => {
    it("returns paginated session instances for a club within date range", async () => {
      const clubId = genId<"clubs">("clubs");
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const filters = { fromDate: Date.now() - 86400000, toDate: Date.now() + 86400000 };
      const pagination = { cursor: null, numItems: 10 };
      const instance = createTestSessionInstanceRecord(templateId, clubId, Date.now());
      const paginatedResult = { page: [instance], isDone: true, continueCursor: null };

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

      const result = await listSessionInstancesForClub(mockCtx, clubId, filters, pagination);

      expect(result).toEqual(paginatedResult);
      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionInstances");
      expect(mockQuery.withIndex).toHaveBeenCalledWith("clubIdInstanceDate", expect.any(Function));
    });

    it("executes the complete query chain including order and return", async () => {
      const clubId = genId<"clubs">("clubs");
      const filters = { fromDate: Date.now() - 86400000, toDate: Date.now() + 86400000 };
      const pagination = { cursor: null, numItems: 10 };
      const instance = createTestSessionInstanceRecord(genId<"sessionTemplates">("sessionTemplates"), clubId, Date.now());
      const paginatedResult = { page: [instance], isDone: true, continueCursor: null };

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

      const result = await listSessionInstancesForClub(mockCtx, clubId, filters, pagination);

      expect(mockWithIndex).toHaveBeenCalledWith("clubIdInstanceDate", expect.any(Function));
      expect(mockOrder).toHaveBeenCalledWith("asc");
      expect(mockPaginate).toHaveBeenCalledWith(pagination);
      expect(result).toBe(paginatedResult);
    });
  });

  describe("listParticipatingSessionInstances", () => {
    it("returns session instances with participation details for a user", async () => {
      const userId = genId<"users">("users");
      const sessionInstanceId = genId<"sessionInstances">("sessionInstances");
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const clubId = genId<"clubs">("clubs");
      const instanceDate = Date.now();
      const filters = { fromDate: instanceDate - 86400000, toDate: instanceDate + 86400000 };
      const pagination = { cursor: null, numItems: 10 };

      const participation = createTestSessionParticipantRecord(
        sessionInstanceId,
        userId,
        "timeslot-1",
        instanceDate,
      );
      const sessionInstance = createTestSessionInstanceRecord(templateId, clubId, instanceDate);
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
      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(sessionInstance);

      const result = await listParticipatingSessionInstances(mockCtx, userId, filters, pagination);

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual({ ...sessionInstance, participation });
      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionParticipants");
      expect(mockCtx.db.get).toHaveBeenCalledWith(sessionInstanceId);
    });

    it("filters out sessions that no longer exist", async () => {
      const userId = genId<"users">("users");
      const sessionInstanceId = genId<"sessionInstances">("sessionInstances");
      const instanceDate = Date.now();
      const filters = { fromDate: instanceDate - 86400000, toDate: instanceDate + 86400000 };
      const pagination = { cursor: null, numItems: 10 };

      const participation = createTestSessionParticipantRecord(
        sessionInstanceId,
        userId,
        "timeslot-1",
        instanceDate,
      );
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

      const result = await listParticipatingSessionInstances(mockCtx, userId, filters, pagination);

      expect(result.page).toHaveLength(0);
    });

    it("processes session promises and filters null results correctly", async () => {
      const userId = genId<"users">("users");
      const sessionInstanceId1 = genId<"sessionInstances">("sessionInstances");
      const sessionInstanceId2 = genId<"sessionInstances">("sessionInstances");
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const clubId = genId<"clubs">("clubs");
      const instanceDate = Date.now();
      const filters = { fromDate: instanceDate - 86400000, toDate: instanceDate + 86400000 };
      const pagination = { cursor: null, numItems: 10 };

      const participation1 = createTestSessionParticipantRecord(
        sessionInstanceId1,
        userId,
        "timeslot-1",
        instanceDate,
      );
      const participation2 = createTestSessionParticipantRecord(
        sessionInstanceId2,
        userId,
        "timeslot-1",
        instanceDate,
      );
      const sessionInstance = createTestSessionInstanceRecord(templateId, clubId, instanceDate);
      const participationResult = { page: [participation1, participation2], isDone: true, continueCursor: null };

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
      
      // Mock db.get to return valid session for first call, null for second
      vi.mocked(mockCtx.db.get)
        .mockImplementationOnce(async (id) => {
          if (id === sessionInstanceId1) return sessionInstance;
          return null;
        })
        .mockImplementationOnce(async (id) => {
          if (id === sessionInstanceId2) return null;
          return sessionInstance;
        });

      const result = await listParticipatingSessionInstances(mockCtx, userId, filters, pagination);

      // Verify the Promise.all and filter operations executed
      expect(mockCtx.db.get).toHaveBeenCalledTimes(2);
      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual({ ...sessionInstance, participation: participation1 });
      expect(result.isDone).toBe(true);
      expect(result.continueCursor).toBeNull();
    });
  });

  describe("listSessionParticipationsForUser", () => {
    it("returns all participation records for a user in a session", async () => {
      const sessionInstanceId = genId<"sessionInstances">("sessionInstances");
      const userId = genId<"users">("users");
      const participation1 = createTestSessionParticipantRecord(
        sessionInstanceId,
        userId,
        "timeslot-1",
        Date.now(),
      );
      const participation2 = createTestSessionParticipantRecord(
        sessionInstanceId,
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

      const result = await listSessionParticipationsForUser(mockCtx, sessionInstanceId, userId);

      expect(result).toEqual([participation1, participation2]);
      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionParticipants");
      expect(mockWithIndex).toHaveBeenCalledWith("instanceUser", expect.any(Function));
      expect(mockCollect).toHaveBeenCalled();
    });
  });

  describe("listAllSessionParticipants", () => {
    it("returns all participants for a session instance", async () => {
      const sessionInstanceId = genId<"sessionInstances">("sessionInstances");
      const userId1 = genId<"users">("users");
      const userId2 = genId<"users">("users");
      const participation1 = createTestSessionParticipantRecord(
        sessionInstanceId,
        userId1,
        "timeslot-1",
        Date.now(),
      );
      const participation2 = createTestSessionParticipantRecord(
        sessionInstanceId,
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

      const result = await listAllSessionParticipants(mockCtx, sessionInstanceId);

      expect(result).toEqual([participation1, participation2]);
      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionParticipants");
      expect(mockQuery.withIndex).toHaveBeenCalledWith("sessionInstanceId", expect.any(Function));
    });

    it("executes collect operation and returns result directly", async () => {
      const sessionInstanceId = genId<"sessionInstances">("sessionInstances");
      const participants = [
        createTestSessionParticipantRecord(sessionInstanceId, genId<"users">("users"), "timeslot-1", Date.now()),
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

      const result = await listAllSessionParticipants(mockCtx, sessionInstanceId);

      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionParticipants");
      expect(mockWithIndex).toHaveBeenCalledWith("sessionInstanceId", expect.any(Function));
      expect(mockCollect).toHaveBeenCalled();
      expect(result).toBe(participants);
    });
  });

  describe("getSessionInstanceAtDate", () => {
    it("returns session instance when found for template and date", async () => {
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const clubId = genId<"clubs">("clubs");
      const instanceDate = Date.now();
      const instance = createTestSessionInstanceRecord(templateId, clubId, instanceDate);

      const mockFirst = vi.fn().mockResolvedValueOnce(instance);
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

      const result = await getSessionInstanceAtDate(mockCtx, templateId, instanceDate);

      expect(result).toEqual(instance);
      expect(mockCtx.db.query).toHaveBeenCalledWith("sessionInstances");
      expect(mockWithIndex).toHaveBeenCalledWith(
        "sessionTemplateIdInstanceDate",
        expect.any(Function),
      );
    });

    it("returns null when session instance not found", async () => {
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const instanceDate = Date.now();

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

      const result = await getSessionInstanceAtDate(mockCtx, templateId, instanceDate);

      expect(result).toBeNull();
    });
  });

  describe("createSessionTemplate", () => {
    it("creates session template with correct automatic fields", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const input = createTestSessionTemplateInput(clubId);
      const templateId = genId<"sessionTemplates">("sessionTemplates");

      vi.mocked(mockCtx.db.insert).mockResolvedValueOnce(templateId);

      const result = await createSessionTemplate(mockCtx, input);

      expect(result).toBe(templateId);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("sessionTemplates", {
        ...input,
        createdBy: mockCtx.currentUser._id,
        createdAt: expect.any(Number),
        modifiedAt: expect.any(Number),
      });
    });
  });

  describe("createSessionInstance", () => {
    it("creates session instance with correct automatic fields", async () => {
      const clubId = genId<"clubs">("clubs");
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const instanceDate = Date.now();
      const input = { ...createTestSessionTemplateInput(clubId), createdAt: Date.now() };
      const instanceId = genId<"sessionInstances">("sessionInstances");

      vi.mocked(mockMutationCtx.db.insert).mockResolvedValueOnce(instanceId);

      const result = await createSessionInstance(mockMutationCtx, input, templateId, instanceDate);

      expect(result).toBe(instanceId);
      expect(mockMutationCtx.db.insert).toHaveBeenCalledWith("sessionInstances", {
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
        sessionTemplateId: templateId,
        timeslots: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            numParticipants: 0,
            numWaitlisted: 0,
          }),
        ]),
        instanceDate,
        status: SESSION_STATUS.NOT_STARTED,
      });
    });

    it("initializes timeslot participant counts correctly", async () => {
      const clubId = genId<"clubs">("clubs");
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const instanceDate = Date.now();
      const userId1 = genId<"users">("users");
      const userId2 = genId<"users">("users");
      const input = {
        ...createTestSessionTemplateInput(clubId, {
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
      const instanceId = genId<"sessionInstances">("sessionInstances");

      vi.mocked(mockMutationCtx.db.insert).mockResolvedValueOnce(instanceId);

      await createSessionInstance(mockMutationCtx, input, templateId, instanceDate);

      const insertCall = vi.mocked(mockMutationCtx.db.insert).mock.calls[0];
      const insertedData = insertCall[1] as Record<string, unknown>;

      expect((insertedData.timeslots as unknown[])[0]).toMatchObject({
        numParticipants: 2, // Length of permanentParticipants
        numWaitlisted: 0,
        id: expect.any(String),
      });
    });

    it("executes complete instance creation with schema parsing and timeslot mapping", async () => {
      const clubId = genId<"clubs">("clubs");
      const templateId = genId<"sessionTemplates">("sessionTemplates");
      const instanceDate = Date.now();
      const userId1 = genId<"users">("users");
      const input = {
        ...createTestSessionTemplateInput(clubId, {
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
      const instanceId = genId<"sessionInstances">("sessionInstances");

      vi.mocked(mockMutationCtx.db.insert).mockImplementationOnce(async (table, data) => {
        // Verify the complete data structure is created correctly
        expect(table).toBe("sessionInstances");
        expect(data).toMatchObject({
          sessionTemplateId: templateId,
          instanceDate,
          status: SESSION_STATUS.NOT_STARTED,
          timeslots: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              numParticipants: 1, // permanentParticipants.length
              numWaitlisted: 0,
              name: "Court 1",
            }),
          ]),
        });
        return instanceId;
      });

      const result = await createSessionInstance(mockMutationCtx, input, templateId, instanceDate);

      expect(result).toBe(instanceId);
      expect(mockMutationCtx.db.insert).toHaveBeenCalledTimes(1);
    });
  });
});
