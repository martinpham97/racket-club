import {
  AUTH_ACCESS_DENIED_ERROR,
  AUTH_UNAUTHENTICATED_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import { getCurrentUser } from "@/convex/service/users/database";
import { createTestUserRecord } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { enforceAuthenticated, enforceOwnershipOrAdmin } from "../auth";

vi.mock("@/convex/service/users/database");

describe("auth validators", () => {
  const user = createTestUserRecord();
  const userNoProfile = createTestUserRecord({ profile: null });
  const adminUser = createTestUserRecord({
    profile: { isAdmin: true },
  });

  describe("enforceOwnershipOrAdmin", () => {
    it("allows admin to access any user", () => {
      expect(() => enforceOwnershipOrAdmin(adminUser, user._id)).not.toThrow();
      expect(() => enforceOwnershipOrAdmin(adminUser, userNoProfile._id)).not.toThrow();
    });

    it("allows user to access their own data", () => {
      expect(() => enforceOwnershipOrAdmin(user, user._id)).not.toThrow();
      expect(() => enforceOwnershipOrAdmin(userNoProfile, userNoProfile._id)).not.toThrow();
    });

    it("throws access denied for non-admin accessing other user", () => {
      expect(() => enforceOwnershipOrAdmin(user, adminUser._id)).toThrow(
        new ConvexError(AUTH_ACCESS_DENIED_ERROR),
      );
      expect(() => enforceOwnershipOrAdmin(user, userNoProfile._id)).toThrow(
        new ConvexError(AUTH_ACCESS_DENIED_ERROR),
      );
    });

    it("throws access denied for no-profile user accessing other user", () => {
      expect(() => enforceOwnershipOrAdmin(userNoProfile, user._id)).toThrow(
        new ConvexError(AUTH_ACCESS_DENIED_ERROR),
      );
    });
  });

  describe("enforceAuthenticated", () => {
    const mockCtx = {} as any;

    it("returns user when authenticated", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(user);

      const result = await enforceAuthenticated(mockCtx);

      expect(result).toBe(user);
    });

    it("throws unauthenticated error when user is null", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      await expect(enforceAuthenticated(mockCtx)).rejects.toThrow(
        new ConvexError(AUTH_UNAUTHENTICATED_ERROR),
      );
    });

    it("allows user without profile when profile not required", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(userNoProfile);

      const result = await enforceAuthenticated(mockCtx);

      expect(result).toBe(userNoProfile);
    });

    it("throws profile required error when profile required but missing", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(userNoProfile);

      await expect(enforceAuthenticated(mockCtx, { profileRequired: true })).rejects.toThrow(
        new ConvexError(USER_PROFILE_REQUIRED_ERROR),
      );
    });

    it("allows user with profile when profile required", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(user);

      const result = await enforceAuthenticated(mockCtx, { profileRequired: true });

      expect(result).toBe(user);
    });
  });
});
