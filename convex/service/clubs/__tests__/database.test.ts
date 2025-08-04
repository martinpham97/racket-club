import { QueryCtx } from "@/convex/_generated/server";
import { CLUB_NOT_FOUND_ERROR } from "@/convex/constants/errors";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClub, createTestClubRecord } from "@/test-utils/samples/clubs";
import { createTestUserRecord, genId } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClub,
  getClub,
  getClubOrThrow,
  getMyClubMembership,
  listClubMembers,
  listMyClubs,
  listPublicClubs,
  updateClub,
} from "../database";

const createMockAuthCtx = (): AuthenticatedWithProfileCtx =>
  ({
    ...createMockCtx<QueryCtx>(),
    currentUser: createTestUserRecord(),
  }) as unknown as AuthenticatedWithProfileCtx;

describe("Club Database Service", () => {
  let mockCtx: QueryCtx;

  beforeEach(() => {
    mockCtx = createMockCtx();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getClub", () => {
    it("returns club when found", async () => {
      const clubId = genId<"clubs">("clubs");
      const club = createTestClubRecord(genId<"users">("users"));

      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(club);

      const result = await getClub(mockCtx, clubId);

      expect(result).toEqual(club);
      expect(mockCtx.db.get).toHaveBeenCalledWith(clubId);
    });

    it("returns null when club not found", async () => {
      const clubId = genId<"clubs">("clubs");

      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(null);

      const result = await getClub(mockCtx, clubId);

      expect(result).toBeNull();
    });
  });

  describe("getClubOrThrow", () => {
    it("returns club when found", async () => {
      const clubId = genId<"clubs">("clubs");
      const club = createTestClubRecord(genId<"users">("users"));

      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(club);

      const result = await getClubOrThrow(mockCtx, clubId);

      expect(result).toEqual(club);
    });

    it("throws error when club not found", async () => {
      const clubId = genId<"clubs">("clubs");

      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(null);

      await expect(getClubOrThrow(mockCtx, clubId)).rejects.toThrow(
        new ConvexError(CLUB_NOT_FOUND_ERROR),
      );
    });
  });

  describe("getMyClubMembership", () => {
    it("returns membership when user is member", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const membership = { clubId, profileId: mockCtx.currentUser.profile._id };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          unique: vi.fn().mockResolvedValueOnce(membership),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await getMyClubMembership(mockCtx, clubId);

      expect(result).toEqual(membership);
      expect(mockCtx.db.query).toHaveBeenCalledWith("clubMemberships");
    });

    it("returns null when user is not member", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");

      const mockQuery = {
        withIndex: vi.fn(() => ({
          unique: vi.fn().mockResolvedValueOnce(null),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await getMyClubMembership(mockCtx, clubId);

      expect(result).toBeNull();
    });
  });

  describe("listPublicClubs", () => {
    it("returns paginated public clubs", async () => {
      const paginationOpts = { cursor: null, numItems: 10 };
      const clubs = [createTestClub(genId<"users">("users"))];
      const paginatedResult = { page: clubs, isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          paginate: vi.fn().mockResolvedValueOnce(paginatedResult),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listPublicClubs(mockCtx, paginationOpts);

      expect(result).toEqual(paginatedResult);
      expect(mockCtx.db.query).toHaveBeenCalledWith("clubs");
    });
  });

  describe("listMyClubs", () => {
    it("returns user's clubs with membership details", async () => {
      const mockCtx = createMockAuthCtx();
      const paginationOpts = { cursor: null, numItems: 10 };
      const clubId = genId<"clubs">("clubs");
      const membership = { clubId, profileId: mockCtx.currentUser.profile._id };
      const club = createTestClubRecord(genId<"users">("users"));
      const memberships = { page: [membership], isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          paginate: vi.fn().mockResolvedValueOnce(memberships),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(club);

      const result = await listMyClubs(mockCtx, paginationOpts);

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual({ ...club, membership });
    });
  });

  describe("listClubMembers", () => {
    it("returns approved members by default", async () => {
      const clubId = genId<"clubs">("clubs");
      const paginationOpts = { cursor: null, numItems: 10 };
      const members = [{ clubId, isApproved: true }];
      const paginatedResult = { page: members, isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          paginate: vi.fn().mockResolvedValueOnce(paginatedResult),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listClubMembers(mockCtx, clubId, {}, paginationOpts);

      expect(result).toEqual(paginatedResult);
    });

    it("returns all members when includeAllMembers is true", async () => {
      const clubId = genId<"clubs">("clubs");
      const paginationOpts = { cursor: null, numItems: 10 };
      const members = [{ clubId, isApproved: false }];
      const paginatedResult = { page: members, isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          paginate: vi.fn().mockResolvedValueOnce(paginatedResult),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listClubMembers(
        mockCtx,
        clubId,
        { includeAllMembers: true },
        paginationOpts,
      );

      expect(result).toEqual(paginatedResult);
    });
  });

  describe("createClub", () => {
    it("creates club with correct defaults", async () => {
      const mockCtx = createMockAuthCtx();
      const input = createTestClub(mockCtx.currentUser._id);
      const clubId = genId<"clubs">("clubs");

      vi.mocked(mockCtx.db.insert).mockResolvedValueOnce(clubId);

      const result = await createClub(mockCtx, input);

      expect(result).toBe(clubId);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("clubs", {
        ...input,
        isApproved: false,
        createdBy: mockCtx.currentUser._id,
        numMembers: 0,
      });
    });
  });

  describe("updateClub", () => {
    it("updates club with provided data", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const input = { name: "Updated Club Name" };

      vi.mocked(mockCtx.db.patch).mockResolvedValueOnce(undefined);

      await updateClub(mockCtx, clubId, input);

      expect(mockCtx.db.patch).toHaveBeenCalledWith(clubId, input);
    });
  });
});
