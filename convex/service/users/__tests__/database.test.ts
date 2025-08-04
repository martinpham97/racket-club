import { MutationCtx } from "@/convex/_generated/server";
import { AUTH_PROVIDER_NO_EMAIL_ERROR } from "@/convex/constants/errors";
import {
  createUserProfile,
  findUserByEmail,
  getCurrentUser,
  getOrCreateUser,
  getProfileByUserId,
  updateUserProfile,
} from "@/convex/service/users/database";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestUserRecord, genId } from "@/test-utils/samples/users";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

vi.mock("convex-helpers/server/relationships", () => ({
  getOneFrom: vi.fn(),
}));

const { getAuthUserId } = vi.mocked(await import("@convex-dev/auth/server"));
const { getOneFrom } = vi.mocked(await import("convex-helpers/server/relationships"));

describe("User Database Service", () => {
  let mockCtx: MutationCtx;

  beforeEach(() => {
    mockCtx = createMockCtx();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("findUserByEmail", () => {
    it("returns user when found", async () => {
      const { profile: _profile, ...user } = createTestUserRecord({ email: "test@example.com" });
      getOneFrom.mockResolvedValueOnce(user);

      const result = await findUserByEmail(mockCtx, "test@example.com");

      expect(result).toEqual(user);
      expect(getOneFrom).toHaveBeenCalledWith(mockCtx.db, "users", "email", "test@example.com");
    });

    it("returns null when user not found", async () => {
      getOneFrom.mockResolvedValueOnce(null);

      const result = await findUserByEmail(mockCtx, "nonexistent@example.com");

      expect(result).toBeNull();
    });
  });

  describe("getCurrentUser", () => {
    it("returns current user with profile", async () => {
      const userId = genId<"users">("users");
      const user = createTestUserRecord({ _id: userId });
      const profile = user.profile;

      getAuthUserId.mockResolvedValueOnce(userId);
      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(user);
      getOneFrom.mockResolvedValueOnce(profile);

      const result = await getCurrentUser(mockCtx);

      expect(result).toEqual({ ...user, profile });
    });

    it("returns null when not authenticated", async () => {
      getAuthUserId.mockResolvedValueOnce(null);

      const result = await getCurrentUser(mockCtx);

      expect(result).toBeNull();
    });

    it("returns null when user not found", async () => {
      const userId = genId<"users">("users");
      getAuthUserId.mockResolvedValueOnce(userId);
      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(null);

      const result = await getCurrentUser(mockCtx);

      expect(result).toBeNull();
    });
  });

  describe("getProfileByUserId", () => {
    it("returns profile when found", async () => {
      const userId = genId<"users">("users");
      const profile = createTestUserRecord().profile;
      getOneFrom.mockResolvedValueOnce(profile);

      const result = await getProfileByUserId(mockCtx, userId);

      expect(result).toEqual(profile);
    });

    it("returns null when profile not found", async () => {
      const userId = genId<"users">("users");
      getOneFrom.mockResolvedValueOnce(null);

      const result = await getProfileByUserId(mockCtx, userId);

      expect(result).toBeNull();
    });
  });

  describe("createUserProfile", () => {
    it("creates new profile when none exists", async () => {
      const userId = genId<"users">("users");
      const profileId = genId<"userProfiles">("userProfiles");
      const input = { userId, firstName: "John", lastName: "Doe" };

      getOneFrom.mockResolvedValueOnce(null);
      vi.mocked(mockCtx.db.insert).mockResolvedValueOnce(profileId);

      const result = await createUserProfile(mockCtx, input);

      expect(result).toBe(profileId);
    });
  });

  describe("updateUserProfile", () => {
    it("updates existing profile", async () => {
      const userId = genId<"users">("users");
      const profileId = genId<"userProfiles">("userProfiles");
      const input = { userId, firstName: "Updated", lastName: "Name" };

      vi.mocked(mockCtx.db.patch).mockResolvedValueOnce(undefined);

      await updateUserProfile(mockCtx, profileId, input);

      expect(mockCtx.db.patch).toHaveBeenCalledWith(profileId, input);
    });
  });

  describe("getOrCreateUser", () => {
    it("returns existing user ID when provided", async () => {
      const existingUserId = genId<"users">("users");
      const args = { existingUserId };

      const result = await getOrCreateUser(mockCtx, args);

      expect(result).toBe(existingUserId);
    });

    it("throws error when no email provided", async () => {
      const args = {};

      await expect(getOrCreateUser(mockCtx, args)).rejects.toThrow(
        new ConvexError(AUTH_PROVIDER_NO_EMAIL_ERROR),
      );
    });

    it("returns existing user ID when user found by email", async () => {
      const { profile: _profile, ...user } = createTestUserRecord({ email: "test@example.com" });
      const args = { email: "test@example.com" };

      // Mock findUserByEmail call inside getOrCreateUser
      getOneFrom.mockResolvedValueOnce(user);

      const result = await getOrCreateUser(mockCtx, args);

      expect(result).toBe(user._id);
      expect(getOneFrom).toHaveBeenCalledWith(mockCtx.db, "users", "email", "test@example.com");
    });

    it("creates new user when not found", async () => {
      const newUserId = genId<"users">("users");
      const args = { email: "new@example.com" };

      // Mock findUserByEmail to return null (user not found)
      getOneFrom.mockResolvedValueOnce(null);
      vi.mocked(mockCtx.db.insert).mockResolvedValueOnce(newUserId);

      const result = await getOrCreateUser(mockCtx, args);

      expect(result).toBe(newUserId);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("users", {
        email: "new@example.com",
      });
    });
  });
});
