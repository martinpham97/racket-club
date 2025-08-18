import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_NOT_FOUND_ERROR,
  CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
} from "@/convex/constants/errors";
import * as clubDatabase from "@/convex/service/clubs/database";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import * as authModule from "@/convex/service/utils/validators/auth";
import {
  enforceClubMembershipPermissions,
  enforceClubOwnershipOrAdmin,
  validateBulkMemberships,
  validateClubJoinability,
  validateClubName,
  validateClubUpdateInput,
  validateMembershipExists,
} from "@/convex/service/utils/validators/clubs";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/auth");
vi.mock("@/convex/service/clubs/database");

const mockIsOwnerOrSystemAdmin = vi.mocked(authModule.isOwnerOrSystemAdmin);
const mockGetClubMembershipForUser = vi.mocked(clubDatabase.getClubMembershipForUser);

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
      expect(mockGetClubMembershipForUser).not.toHaveBeenCalled();
    });

    it("should allow access when user is system admin", async () => {
      const adminUser = createTestUserRecord({ profile: { isAdmin: true } });
      const otherUserClub = createTestClubRecord(createTestUserRecord()._id);

      mockCtx.currentUser = adminUser;
      mockIsOwnerOrSystemAdmin.mockReturnValue(true);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, otherUserClub)).resolves.toBeUndefined();

      expect(mockIsOwnerOrSystemAdmin).toHaveBeenCalledWith(adminUser, otherUserClub.createdBy);
      expect(mockGetClubMembershipForUser).not.toHaveBeenCalled();
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

      mockGetClubMembershipForUser.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).resolves.toBeUndefined();

      expect(mockGetClubMembershipForUser).toHaveBeenCalledWith(
        mockCtx,
        testClub._id,
        testUser._id,
      );
    });

    it("should not allow access when user is approved member (but is not club admin)", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id);

      mockGetClubMembershipForUser.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetClubMembershipForUser).toHaveBeenCalledWith(
        mockCtx,
        testClub._id,
        testUser._id,
      );
    });

    it("should deny access when user is not approved member", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id, {
        isApproved: false,
      });

      mockGetClubMembershipForUser.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetClubMembershipForUser).toHaveBeenCalledWith(
        mockCtx,
        testClub._id,
        testUser._id,
      );
    });

    it("should deny access when user is not a member", async () => {
      mockGetClubMembershipForUser.mockResolvedValue(null);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetClubMembershipForUser).toHaveBeenCalledWith(
        mockCtx,
        testClub._id,
        testUser._id,
      );
    });

    it("should deny access when user is club admin but not approved", async () => {
      const membership = createTestClubMembershipRecord(testClub._id, testUser.profile!._id, {
        isApproved: false,
        isClubAdmin: true,
      });

      mockGetClubMembershipForUser.mockResolvedValue(membership);

      await expect(enforceClubOwnershipOrAdmin(mockCtx, testClub)).rejects.toThrow(
        AUTH_ACCESS_DENIED_ERROR,
      );

      expect(mockGetClubMembershipForUser).toHaveBeenCalledWith(
        mockCtx,
        testClub._id,
        testUser._id,
      );
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

    await expect(validateClubName(mockCtx, "Test Club", true)).resolves.toBeUndefined();
  });

  it("throws when public club name already exists", async () => {
    const existingClub = createTestClubRecord(createTestUserRecord()._id);

    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(existingClub),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubName(mockCtx, "Existing Club", true)).rejects.toThrow(
      CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
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

describe("validateClubUpdateInput", () => {
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

  it("should not validate when neither name nor visibility is updated", async () => {
    const input = { description: "New description" };

    await expect(validateClubUpdateInput(mockCtx, input, testClub)).resolves.toBeUndefined();
  });

  it("should validate name when name is updated", async () => {
    const input = { name: "New Name" };

    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubUpdateInput(mockCtx, input, testClub)).resolves.toBeUndefined();
  });

  it("should validate name when visibility is updated", async () => {
    const input = { isPublic: true };

    vi.mocked(mockCtx.db.query).mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    } as unknown as ReturnType<typeof mockCtx.db.query>);

    await expect(validateClubUpdateInput(mockCtx, input, testClub)).resolves.toBeUndefined();
  });

  it("should throw when non-admin tries to approve club", async () => {
    const input = { isApproved: true };

    await expect(validateClubUpdateInput(mockCtx, input, testClub)).rejects.toThrow(
      AUTH_ACCESS_DENIED_ERROR,
    );
  });

  it("should allow admin to approve club", async () => {
    const adminUser = createTestUserRecord({ profile: { isAdmin: true } });
    mockCtx.currentUser = adminUser;
    const input = { isApproved: true };

    await expect(validateClubUpdateInput(mockCtx, input, testClub)).resolves.toBeUndefined();
  });
});

describe("validateMembershipExists", () => {
  it("should return membership when it exists", () => {
    const membership = createTestClubMembershipRecord(
      "club123" as Id<"clubs">,
      "user123" as Id<"users">,
    );

    expect(validateMembershipExists(membership)).toBe(membership);
  });

  it("should throw when membership is null", () => {
    expect(() => validateMembershipExists(null)).toThrow(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
  });
});

describe("validateClubJoinability", () => {
  it("should allow joining when club has capacity", () => {
    const club = createTestClubRecord("user123" as Id<"users">, {
      numMembers: 5,
      maxMembers: 10,
      isPublic: true,
      isApproved: true,
    });

    expect(() => validateClubJoinability(club)).not.toThrow();
  });

  it("should throw when club is full", () => {
    const club = createTestClubRecord("user123" as Id<"users">, {
      numMembers: 10,
      maxMembers: 10,
    });

    expect(() => validateClubJoinability(club)).toThrow(CLUB_FULL_ERROR);
  });

  it("should throw when public club is unapproved", () => {
    const club = createTestClubRecord("user123" as Id<"users">, {
      isPublic: true,
      isApproved: false,
    });

    expect(() => validateClubJoinability(club)).toThrow(CLUB_PUBLIC_UNAPPROVED_ERROR);
  });
});

describe("validateBulkMemberships", () => {
  let mockCtx: AuthenticatedWithProfileCtx;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockCtx<AuthenticatedWithProfileCtx>();
  });

  it("should return empty when no membership IDs provided", async () => {
    const result = await validateBulkMemberships(mockCtx, []);

    expect(result).toEqual({ memberships: [], clubId: null });
  });

  it("should return empty when no memberships found", async () => {
    vi.mocked(mockCtx.db.get).mockResolvedValue(null);

    const result = await validateBulkMemberships(mockCtx, ["id1" as Id<"clubMemberships">]);

    expect(result).toEqual({ memberships: [], clubId: null });
  });

  it("should return memberships from same club", async () => {
    const clubId = "club123" as Id<"clubs">;
    const membership1 = createTestClubMembershipRecord(clubId, "user1" as Id<"users">);
    const membership2 = createTestClubMembershipRecord(clubId, "user2" as Id<"users">);

    vi.mocked(mockCtx.db.get).mockResolvedValueOnce(membership1).mockResolvedValueOnce(membership2);

    const result = await validateBulkMemberships(mockCtx, [
      "id1" as Id<"clubMemberships">,
      "id2" as Id<"clubMemberships">,
    ]);

    expect(result).toEqual({
      memberships: [membership1, membership2],
      clubId,
    });
  });

  it("should throw when memberships are from different clubs", async () => {
    const membership1 = createTestClubMembershipRecord(
      "club1" as Id<"clubs">,
      "user1" as Id<"users">,
    );
    const membership2 = createTestClubMembershipRecord(
      "club2" as Id<"clubs">,
      "user2" as Id<"users">,
    );

    vi.mocked(mockCtx.db.get).mockResolvedValueOnce(membership1).mockResolvedValueOnce(membership2);

    await expect(
      validateBulkMemberships(mockCtx, [
        "id1" as Id<"clubMemberships">,
        "id2" as Id<"clubMemberships">,
      ]),
    ).rejects.toThrow(CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR);
  });
});
