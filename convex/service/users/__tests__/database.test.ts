import {
  AUTH_PROVIDER_NO_EMAIL_ERROR,
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import {
  createOrUpdateUser,
  createUserProfile,
  findUserByEmail,
  getCurrentUser,
  getProfileByUserId,
  updateUserProfile,
} from "@/convex/service/users/database";
import { createTestUserRecord, genId } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

vi.mock("convex-helpers/server/relationships", () => ({
  getOneFrom: vi.fn(),
}));

const { getAuthUserId } = vi.mocked(await import("@convex-dev/auth/server"));
const { getOneFrom } = vi.mocked(await import("convex-helpers/server/relationships"));

describe("User Database Service", () => {
  const mockCtx = {
    db: {
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
    },
  };

  describe("findUserByEmail", () => {
    it("returns user when found", async () => {
      const { profile, ...user } = createTestUserRecord({ email: "test@example.com" });
      getOneFrom.mockResolvedValueOnce(user);

      const result = await findUserByEmail(mockCtx as any, "test@example.com");

      expect(result).toEqual(user);
      expect(getOneFrom).toHaveBeenCalledWith(mockCtx.db, "users", "email", "test@example.com");
    });

    it("returns null when user not found", async () => {
      getOneFrom.mockResolvedValueOnce(null);

      const result = await findUserByEmail(mockCtx as any, "nonexistent@example.com");

      expect(result).toBeNull();
    });
  });

  describe("getCurrentUser", () => {
    it("returns current user with profile", async () => {
      const userId = genId<"users">("users");
      const user = createTestUserRecord({ _id: userId });
      const profile = user.profile;

      getAuthUserId.mockResolvedValueOnce(userId);
      mockCtx.db.get.mockResolvedValueOnce(user);
      getOneFrom.mockResolvedValueOnce(profile);

      const result = await getCurrentUser(mockCtx as any);

      expect(result).toEqual({ ...user, profile });
    });

    it("returns null when not authenticated", async () => {
      getAuthUserId.mockResolvedValueOnce(null);

      const result = await getCurrentUser(mockCtx as any);

      expect(result).toBeNull();
    });

    it("returns null when user not found", async () => {
      const userId = genId<"users">("users");
      getAuthUserId.mockResolvedValueOnce(userId);
      mockCtx.db.get.mockResolvedValueOnce(null);

      const result = await getCurrentUser(mockCtx as any);

      expect(result).toBeNull();
    });
  });

  describe("getProfileByUserId", () => {
    it("returns profile when found", async () => {
      const userId = genId<"users">("users");
      const profile = createTestUserRecord().profile;
      getOneFrom.mockResolvedValueOnce(profile);

      const result = await getProfileByUserId(mockCtx as any, userId);

      expect(result).toEqual(profile);
    });

    it("returns null when profile not found", async () => {
      const userId = genId<"users">("users");
      getOneFrom.mockResolvedValueOnce(null);

      const result = await getProfileByUserId(mockCtx as any, userId);

      expect(result).toBeNull();
    });
  });

  describe("createUserProfile", () => {
    it("creates new profile when none exists", async () => {
      const userId = genId<"users">("users");
      const profileId = genId<"userProfiles">("userProfiles");
      const input = { userId, firstName: "John", lastName: "Doe" };

      getOneFrom.mockResolvedValueOnce(null);
      mockCtx.db.insert.mockResolvedValueOnce(profileId);

      const result = await createUserProfile(mockCtx as any, input);

      expect(result).toBe(profileId);
    });

    it("throws when profile exists", async () => {
      const userId = genId<"users">("users");
      const existingProfile = createTestUserRecord().profile!;
      const input = { userId, firstName: "John", lastName: "Doe" };

      getOneFrom.mockResolvedValueOnce(existingProfile);

      await expect(createUserProfile(mockCtx as any, input)).rejects.toThrow(
        new ConvexError(USER_PROFILE_ALREADY_EXISTS_ERROR),
      );
    });
  });

  describe("updateUserProfile", () => {
    it("updates existing profile", async () => {
      const userId = genId<"users">("users");
      const profile = createTestUserRecord().profile!;
      const input = { userId, firstName: "Updated", lastName: "Name" };

      getOneFrom.mockResolvedValueOnce(profile);
      mockCtx.db.patch.mockResolvedValueOnce(undefined);

      const result = await updateUserProfile(mockCtx as any, input);

      expect(result).toEqual(profile);
    });

    it("throws error when profile not found", async () => {
      const userId = genId<"users">("users");
      const input = { userId, firstName: "John", lastName: "Doe" };

      getOneFrom.mockResolvedValueOnce(null);

      await expect(updateUserProfile(mockCtx as any, input)).rejects.toThrow(
        new ConvexError(USER_PROFILE_REQUIRED_ERROR),
      );
    });
  });

  describe("createOrUpdateUser", () => {
    it("returns existing user ID when provided", async () => {
      const existingUserId = genId<"users">("users");
      const args = { existingUserId };

      const result = await createOrUpdateUser(mockCtx as any, args);

      expect(result).toBe(existingUserId);
    });

    it("throws error when no email provided", async () => {
      const args = {};

      await expect(createOrUpdateUser(mockCtx as any, args)).rejects.toThrow(
        new ConvexError(AUTH_PROVIDER_NO_EMAIL_ERROR),
      );
    });

    it("returns existing user ID when user found by email", async () => {
      const { profile, ...user } = createTestUserRecord({ email: "test@example.com" });
      const args = { email: "test@example.com" };

      getOneFrom.mockResolvedValueOnce(user);

      const result = await createOrUpdateUser(mockCtx as any, args);

      expect(result).toBe(user._id);
      expect(getOneFrom).toHaveBeenCalledWith(mockCtx.db, "users", "email", "test@example.com");
    });

    it("creates new user when not found", async () => {
      const newUserId = genId<"users">("users");
      const args = { email: "new@example.com" };

      getOneFrom.mockResolvedValueOnce(null);
      mockCtx.db.insert.mockResolvedValueOnce(newUserId);

      const result = await createOrUpdateUser(mockCtx as any, args);

      expect(result).toBe(newUserId);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("users", {
        email: "new@example.com",
      });
    });
  });
});
