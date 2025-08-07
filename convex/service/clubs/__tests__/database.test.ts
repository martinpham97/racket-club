import { QueryCtx } from "@/convex/_generated/server";
import { CLUB_NOT_FOUND_ERROR } from "@/convex/constants/errors";
import {
  createClub,
  deleteAllClubMemberships,
  getClub,
  getClubBanRecordForUser,
  getClubOrThrow,
  getMyClubMembership,
  listMyClubs,
  listPublicClubs,
  updateClub,
} from "@/convex/service/clubs/database";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClub, createTestClubBanRecord, createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import { genId } from "@/test-utils/samples/id";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  describe("getClubBanRecordForUser", () => {
    it("returns active ban when user is banned", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const userId = genId<"users">("users");
      const ban = createTestClubBanRecord(clubId, userId, mockCtx.currentUser._id);

      const mockQuery = {
        withIndex: vi.fn(() => ({
          filter: vi.fn(() => ({
            unique: vi.fn().mockResolvedValueOnce(ban),
          })),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await getClubBanRecordForUser(mockCtx, clubId, userId);

      expect(result).toEqual(ban);
      expect(mockCtx.db.query).toHaveBeenCalledWith("clubBans");
    });

    it("returns null when user is not banned", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const userId = genId<"users">("users");

      const mockQuery = {
        withIndex: vi.fn(() => ({
          filter: vi.fn(() => ({
            unique: vi.fn().mockResolvedValueOnce(null),
          })),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await getClubBanRecordForUser(mockCtx, clubId, userId);

      expect(result).toBeNull();
    });
  });

  describe("deleteAllClubMemberships", () => {
    it("deletes all memberships and resets member count", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");
      const membership1 = createTestClubMembershipRecord(clubId, genId<"users">("users"));
      const membership2 = createTestClubMembershipRecord(clubId, genId<"users">("users"));
      const memberships = [membership1, membership2];

      const mockQuery = {
        withIndex: vi.fn(() => ({
          collect: vi.fn().mockResolvedValueOnce(memberships),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.delete).mockResolvedValue(undefined);
      vi.mocked(mockCtx.db.patch).mockResolvedValueOnce(undefined);

      await deleteAllClubMemberships(mockCtx, clubId);

      expect(mockCtx.db.query).toHaveBeenCalledWith("clubMemberships");
      expect(mockCtx.db.delete).toHaveBeenCalledTimes(2);
      expect(mockCtx.db.delete).toHaveBeenCalledWith(membership1._id);
      expect(mockCtx.db.delete).toHaveBeenCalledWith(membership2._id);
      expect(mockCtx.db.patch).toHaveBeenCalledWith(clubId, { numMembers: 0 });
    });

    it("handles empty membership list", async () => {
      const mockCtx = createMockAuthCtx();
      const clubId = genId<"clubs">("clubs");

      const mockQuery = {
        withIndex: vi.fn(() => ({
          collect: vi.fn().mockResolvedValueOnce([]),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.patch).mockResolvedValueOnce(undefined);

      await deleteAllClubMemberships(mockCtx, clubId);

      expect(mockCtx.db.delete).not.toHaveBeenCalled();
      expect(mockCtx.db.patch).toHaveBeenCalledWith(clubId, { numMembers: 0 });
    });
  });

  describe("listMyClubs", () => {
    it("filters out clubs that no longer exist", async () => {
      const mockCtx = createMockAuthCtx();
      const paginationOpts = { cursor: null, numItems: 10 };
      const clubId1 = genId<"clubs">("clubs");
      const clubId2 = genId<"clubs">("clubs");
      const membership1 = { clubId: clubId1, profileId: mockCtx.currentUser.profile._id };
      const membership2 = { clubId: clubId2, profileId: mockCtx.currentUser.profile._id };
      const club1 = createTestClubRecord(genId<"users">("users"));
      const memberships = { page: [membership1, membership2], isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          paginate: vi.fn().mockResolvedValueOnce(memberships),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.get)
        .mockResolvedValueOnce(club1)
        .mockResolvedValueOnce(null);

      const result = await listMyClubs(mockCtx, paginationOpts);

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual({ ...club1, membership: membership1 });
    });
  });
});
