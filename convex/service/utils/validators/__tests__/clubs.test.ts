import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
} from "@/convex/constants/errors";
import * as clubDatabase from "@/convex/service/clubs/database";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import * as authModule from "@/convex/service/utils/validators/auth";
import {
  enforceClubMembershipPermissions,
  enforceClubOwnershipOrAdmin,
  validateClubName,
} from "@/convex/service/utils/validators/clubs";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/auth");
vi.mock("@/convex/service/clubs/database");

const mockIsOwnerOrSystemAdmin = vi.mocked(authModule.isOwnerOrSystemAdmin);
const mockGetMyClubMembership = vi.mocked(clubDatabase.getMyClubMembership);

describe("enforceClubOwnershipOrAdmin", () => {
  let mockCtx: AuthenticatedWithProfileCtx;
  let testUser: ReturnType<typeof createTestUserRecord>;
  let testClub: ReturnType<typeof createTestClubRecord>;

  beforeEach(() => {
    vi.clearAllMocks();

    testUser = createTestUserRecord();
    testClub = createTestClubRecord(testUser._id);

    mockCtx = createMockCtx<AuthenticatedWithProfileCtx>({
      currentUser: testUser,
    });
  });

  describe("when user is owner or system admin", () => {
    it("should allow access when user is club owner", async () => {
      mockIsOwnerOrSystemAdmin.mockReturnValue(true);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).resolves.toBeUndefined();

      expect(mockIsOwnerOrSystemAdmin).toHaveBeenCalledWith(testUser, testClub.createdBy);
      expect(mockGetMyClubMembership).not.toHaveBeenCalled();
    });

    it("should allow access when user is system admin", async () => {
      const adminUser = createTestUserRecord({ profile: { isAdmin: true } });
      const otherUserClub = createTestClubRecord(createTestUserRecord()._id);

      mockCtx.currentUser = adminUser;
      mockIsOwnerOrSystemAdmin.mockReturnValue(true);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, otherUserClub)).resolves.toBeUndefined();

      expect(mockIsOwnerOrSystemAdmin).toHaveBeenCalledWith(adminUser, otherUserClub.createdBy);
      expect(mockGetMyClubMembership).not.toHaveBeenCalled();
    });
  });

  describe("when user is not owner or system admin", () => {
    beforeEach(() => {
      mockIsOwnerOrSystemAdmin.mockReturnValue(false);
    });

    it("should allow access when user is approved club admin", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id, {
        isClubAdmin: true,
      });

      mockGetMyClubMembership.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).resolves.toBeUndefined();

      expect(mockGetMyClubMembership).toHaveBeenCalledWith(mockCtx, testClub._id);
    });

    it("should not allow access when user is approved member (but is not club admin)", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id);

      mockGetMyClubMembership.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetMyClubMembership).toHaveBeenCalledWith(mockCtx, testClub._id);
    });

    it("should deny access when user is not approved member", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id, {
        isApproved: false,
      });

      mockGetMyClubMembership.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetMyClubMembership).toHaveBeenCalledWith(mockCtx, testClub._id);
    });

    it("should deny access when user is not a member", async () => {
      mockGetMyClubMembership.mockResolvedValue(null);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetMyClubMembership).toHaveBeenCalledWith(mockCtx, testClub._id);
    });

    it("should deny access when user is club admin but not approved", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id, {
        isApproved: false,
        isClubAdmin: true,
      });

      mockGetMyClubMembership.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetMyClubMembership).toHaveBeenCalledWith(mockCtx, testClub._id);
    });
  });
});

describe("enforceClubMembershipPermissions", () => {
  let mockCtx: AuthenticatedWithProfileCtx;
  let testUser: ReturnType<typeof createTestUserRecord>;
  let testClub: ReturnType<typeof createTestClubRecord>;

  beforeEach(() => {
    vi.clearAllMocks();

    testUser = createTestUserRecord();
    testClub = createTestClubRecord(testUser._id);

    mockCtx = createMockCtx<AuthenticatedWithProfileCtx>({
      currentUser: testUser,
    });
  });

  describe("when user is system admin", () => {
    it("should allow access for system admin", async () => {
      const adminUser = createTestUserRecord({ profile: { isAdmin: true } });
      const otherUserClub = createTestClubRecord(createTestUserRecord()._id);

      mockCtx.currentUser = adminUser;

      await expect(
        enforceClubMembershipPermissions(mockCtx, otherUserClub),
      ).resolves.toBeUndefined();
    });
  });

  describe("when user is club owner", () => {
    it("should allow access for club owner", async () => {
      await expect(enforceClubMembershipPermissions(mockCtx, testClub)).resolves.toBeUndefined();
    });
  });

  describe("when user is not owner or system admin", () => {
    beforeEach(() => {
      const otherUser = createTestUserRecord();
      testClub = createTestClubRecord(otherUser._id);
    });

    it("should allow access for approved club admin", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser._id, {
        isApproved: true,
        isClubAdmin: true,
      });

      vi.mocked(mockCtx.db.query).mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          unique: vi.fn().mockResolvedValue(membership),
        }),
      } as unknown as ReturnType<typeof mockCtx.db.query>);

      await expect(enforceClubMembershipPermissions(mockCtx, testClub)).resolves.toBeUndefined();
    });

    it("should deny access for unapproved club admin", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser._id, {
        isApproved: false,
        isClubAdmin: true,
      });

      vi.mocked(mockCtx.db.query).mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          unique: vi.fn().mockResolvedValue(membership),
        }),
      } as unknown as ReturnType<typeof mockCtx.db.query>);

      await expect(enforceClubMembershipPermissions(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );
    });

    it("should deny access for approved regular member", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser._id, {
        isApproved: true,
        isClubAdmin: false,
      });

      vi.mocked(mockCtx.db.query).mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          unique: vi.fn().mockResolvedValue(membership),
        }),
      } as unknown as ReturnType<typeof mockCtx.db.query>);

      await expect(enforceClubMembershipPermissions(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );
    });

    it("should deny access for non-member", async () => {
      vi.mocked(mockCtx.db.query).mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          unique: vi.fn().mockResolvedValue(null),
        }),
      } as unknown as ReturnType<typeof mockCtx.db.query>);

      await expect(enforceClubMembershipPermissions(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );
    });
  });
});

describe("validateClubName", () => {
  let mockCtx: QueryCtx;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockCtx<QueryCtx>();
  });

  it("allows unique public club name", async () => {
    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubName(mockCtx, "Unique Club", true)).resolves.not.toThrow();
  });

  it("throws when public club name already exists", async () => {
    const existingClub = createTestClubRecord("user123" as Id<"users">, {
      isPublic: true,
      name: "Existing Club",
    });

    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(existingClub),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubName(mockCtx, "Existing Club", true)).rejects.toThrow(
      new ConvexError(CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR),
    );
  });

  it("allows duplicate names for private clubs", async () => {
    const existingClub = createTestClubRecord("user123" as Id<"users">, {
      isPublic: false,
      name: "Private Club",
    });

    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(existingClub),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubName(mockCtx, "Private Club", false)).resolves.not.toThrow();
  });

  it("allows private club name even when public club with same name exists", async () => {
    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubName(mockCtx, "Some Name", false)).resolves.not.toThrow();
  });
});
