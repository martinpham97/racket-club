import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import {
  AUTH_ACCESS_DENIED_ERROR,
  AUTH_UNAUTHENTICATED_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { getCurrentUser } from "@/convex/service/users/database";
import {
  enforceAuthenticated,
  enforceOwnershipOrAdmin,
  isOwnerOrSystemAdmin,
} from "@/convex/service/utils/validators/auth";
import { createTestProfile, createTestUserRecord } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/users/database", () => ({
  getCurrentUser: vi.fn(),
}));

const mockGetCurrentUser = vi.mocked(getCurrentUser);

describe("Auth Validators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isOwnerOrSystemAdmin", () => {
    it("returns true when user is owner", () => {
      const user = createTestUserRecord();

      const result = isOwnerOrSystemAdmin(user, user._id);

      expect(result).toBe(true);
    });

    it("returns true when user is system admin", () => {
      const userId = "user123" as Id<"users">;
      const targetUserId = "target456" as Id<"users">;
      const user = createTestUserRecord({
        profile: createTestProfile(userId, { isAdmin: true }),
      });

      const result = isOwnerOrSystemAdmin(user, targetUserId);

      expect(result).toBe(true);
    });

    it("returns false when user is neither owner nor admin", () => {
      const userId = "user123" as Id<"users">;
      const targetUserId = "target456" as Id<"users">;
      const user = createTestUserRecord({
        profile: createTestProfile(userId, { isAdmin: false }),
      });

      const result = isOwnerOrSystemAdmin(user, targetUserId);

      expect(result).toBe(false);
    });

    it("returns false when user has no profile", () => {
      const targetUserId = "target456" as Id<"users">;
      const user = createTestUserRecord();

      const result = isOwnerOrSystemAdmin(user, targetUserId);

      expect(result).toBe(false);
    });
  });

  describe("enforceOwnershipOrAdmin", () => {
    it("allows owner access", () => {
      const user = createTestUserRecord();

      expect(() => enforceOwnershipOrAdmin(user, user._id)).not.toThrow();
    });

    it("allows system admin access", () => {
      const userId = "user123" as Id<"users">;
      const targetUserId = "target456" as Id<"users">;
      const user = createTestUserRecord({
        profile: createTestProfile(userId, { isAdmin: true }),
      });

      expect(() => enforceOwnershipOrAdmin(user, targetUserId)).not.toThrow();
    });

    it("throws when user is neither owner nor admin", () => {
      const userId = "user123" as Id<"users">;
      const targetUserId = "target456" as Id<"users">;
      const user = createTestUserRecord({
        profile: createTestProfile(userId, { isAdmin: false }),
      });

      expect(() => enforceOwnershipOrAdmin(user, targetUserId)).toThrow(
        new ConvexError(AUTH_ACCESS_DENIED_ERROR),
      );
    });
  });

  describe("enforceAuthenticated", () => {
    it("returns user when authenticated", async () => {
      const user = createTestUserRecord();
      mockGetCurrentUser.mockResolvedValue(user);

      const ctx = {} as QueryCtx;
      const result = await enforceAuthenticated(ctx);

      expect(result).toEqual(user);
    });

    it("throws when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const ctx = {} as QueryCtx;
      await expect(enforceAuthenticated(ctx)).rejects.toThrow(
        new ConvexError(AUTH_UNAUTHENTICATED_ERROR),
      );
    });

    it("returns user when profile not required", async () => {
      const user = createTestUserRecord();
      mockGetCurrentUser.mockResolvedValue(user);

      const ctx = {} as QueryCtx;
      const result = await enforceAuthenticated(ctx, { profileRequired: false });

      expect(result).toEqual(user);
    });

    it("returns user when profile required and exists", async () => {
      const userId = "user123" as Id<"users">;
      const user = createTestUserRecord({ profile: createTestProfile(userId) });
      mockGetCurrentUser.mockResolvedValue(user);

      const ctx = {} as QueryCtx;
      const result = await enforceAuthenticated(ctx, { profileRequired: true });

      expect(result).toEqual(user);
    });

    it("throws when profile required but missing", async () => {
      const user = createTestUserRecord({ profile: null });
      mockGetCurrentUser.mockResolvedValue(user);

      const ctx = {} as QueryCtx;
      await expect(enforceAuthenticated(ctx, { profileRequired: true })).rejects.toThrow(
        new ConvexError(USER_PROFILE_REQUIRED_ERROR),
      );
    });
  });
});
