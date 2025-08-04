import { AUTH_ACCESS_DENIED_ERROR } from "@/convex/constants/errors";
import * as clubDatabase from "@/convex/service/clubs/database";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import * as authModule from "@/convex/service/utils/validators/auth";
import { enforceClubOwnershipOrAdmin } from "@/convex/service/utils/validators/clubs";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestClubMembershipRecord, createTestClubRecord } from "@/test-utils/samples/clubs";
import { createTestUserRecord } from "@/test-utils/samples/users";
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
