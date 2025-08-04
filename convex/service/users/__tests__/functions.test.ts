import { api } from "@/convex/_generated/api";
import {
  AUTH_ACCESS_DENIED_ERROR,
  USER_PROFILE_ALREADY_EXISTS_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("User Functions", () => {
  const t = convexTest(schema);
  const helpers = new UserTestHelpers(t);

  describe("getCurrentUser", () => {
    it("returns null when not authenticated", async () => {
      const result = await t.query(api.service.users.functions.getCurrentUser, {});
      expect(result).toBeNull();
    });

    it("returns user with profile when authenticated", async () => {
      const userId = await helpers.insertUser();
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.getCurrentUser, {});

      expect(result).not.toBeNull();
      expect(result?.profile).toEqual(expect.objectContaining(profile));
    });
  });

  describe("createUserProfile", () => {
    it("creates user profile", async () => {
      const userId = await helpers.insertUser();
      const profile = createTestProfile(userId);
      const args = { userId, firstName: profile.firstName, lastName: profile.lastName };
      const asUser = t.withIdentity({ subject: userId });

      const result = await asUser.mutation(api.service.users.functions.createUserProfile, args);

      expect(result).toBeDefined();
      const createdProfile = await helpers.getProfile(result);
      expect(createdProfile).toEqual(expect.objectContaining(profile));
    });

    it("allows admin to create profile for any user", async () => {
      const adminId = await helpers.insertUser("admin@example.com");
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const targetUserId = await helpers.insertUser("target@example.com");

      const profile = createTestProfile(targetUserId);
      const args = {
        userId: targetUserId,
        firstName: profile.firstName,
        lastName: profile.lastName,
      };
      const asAdmin = t.withIdentity({ subject: adminId });

      const result = await asAdmin.mutation(api.service.users.functions.createUserProfile, args);

      expect(result).toBeDefined();
      const createdProfile = await helpers.getProfile(result);
      expect(createdProfile).toEqual(expect.objectContaining(profile));
    });

    it("throws when profile already exists", async () => {
      const userId = await helpers.insertUser();
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const args = { userId, firstName: "New", lastName: "Name" };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, args),
      ).rejects.toThrow(USER_PROFILE_ALREADY_EXISTS_ERROR);
    });

    it("throws when trying to create profile for another user", async () => {
      const userId = await helpers.insertUser("test@example.com");
      const targetUserId = await helpers.insertUser("target@example.com");
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const args = { userId: targetUserId, firstName: "New", lastName: "Name" };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, args),
      ).rejects.toThrow();
    });
  });

  describe("updateUserProfile", () => {
    it("updates user profile", async () => {
      const userId = await helpers.insertUser();
      const profile = createTestProfile(userId);
      const profileId = await helpers.insertProfile(profile);

      const args = { userId, firstName: "Updated" };
      const asUser = t.withIdentity({ subject: userId });

      await asUser.mutation(api.service.users.functions.updateUserProfile, args);

      const updatedProfile = await helpers.getProfile(profileId);
      expect(updatedProfile).toEqual(expect.objectContaining({ ...profile, firstName: "Updated" }));
    });

    it("allows admin to update any profile", async () => {
      const adminId = await helpers.insertUser("admin@example.com");
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const targetUserId = await helpers.insertUser("target@example.com");
      const targetProfileId = await helpers.insertProfile({
        firstName: "Target",
        lastName: "User",
        isAdmin: false,
        userId: targetUserId,
      });

      const args = { userId: targetUserId, firstName: "AdminUpdated" };
      const asAdmin = t.withIdentity({ subject: adminId });

      await asAdmin.mutation(api.service.users.functions.updateUserProfile, args);

      const updatedProfile = await helpers.getProfile(targetProfileId);
      expect(updatedProfile?.firstName).toBe("AdminUpdated");
    });

    it("rejects when non-admin user tries to modify another user", async () => {
      const userId = await helpers.insertUser("user@example.com");
      await helpers.insertProfile({
        firstName: "User",
        lastName: "One",
        isAdmin: false,
        userId,
      });

      const targetUserId = await helpers.insertUser("target@example.com");
      await helpers.insertProfile({
        firstName: "Target",
        lastName: "User",
        isAdmin: false,
        userId: targetUserId,
      });

      const args = { userId: targetUserId, firstName: "Hacked" };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, args),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });
});
