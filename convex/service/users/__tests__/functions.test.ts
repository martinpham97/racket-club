import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AUTH_ACCESS_DENIED_ERROR,
  USER_PROFILE_ALREADY_EXISTS_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { createTestProfile } from "@/test-utils/samples/users";
import { convexTest, TestConvex } from "convex-test";
import { WithoutSystemFields } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { UserProfile } from "../schemas";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

class TestHelpers {
  constructor(private t: TestConvex<typeof schema>) {}

  async createUser(email = "test@example.com") {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("users", { email });
    });
  }

  async createProfile(profile: WithoutSystemFields<UserProfile>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("userProfiles", {
        ...profile,
      });
    });
  }

  async getProfile(profileId: Id<"userProfiles">) {
    return await this.t.run(async (ctx) => ctx.db.get(profileId));
  }
}

describe("User Functions", () => {
  const t = convexTest(schema);
  const helpers = new TestHelpers(t);

  describe("getCurrentUser", () => {
    it("returns null when not authenticated", async () => {
      const result = await t.query(api.service.users.functions.getCurrentUser, {});
      expect(result).toBeNull();
    });

    it("returns user with profile when authenticated", async () => {
      const userId = await helpers.createUser();
      const profile = createTestProfile(userId);
      await helpers.createProfile(profile);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.getCurrentUser, {});

      expect(result).not.toBeNull();
      expect(result?.profile).toEqual(expect.objectContaining(profile));
    });
  });

  describe("createUserProfile", () => {
    it("creates user profile", async () => {
      const userId = await helpers.createUser();
      const profile = createTestProfile(userId);
      const args = { userId, firstName: profile.firstName, lastName: profile.lastName };
      const asUser = t.withIdentity({ subject: userId });

      const result = await asUser.mutation(api.service.users.functions.createUserProfile, args);

      expect(result).toBeDefined();
      const createdProfile = await helpers.getProfile(result);
      expect(createdProfile).toEqual(expect.objectContaining(profile));
    });

    it("allows admin to create profile for any user", async () => {
      const adminId = await helpers.createUser("admin@example.com");
      await helpers.createProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const targetUserId = await helpers.createUser("target@example.com");

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
      const userId = await helpers.createUser();
      const profile = createTestProfile(userId);
      await helpers.createProfile(profile);

      const args = { userId, firstName: "New", lastName: "Name" };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, args),
      ).rejects.toThrow(USER_PROFILE_ALREADY_EXISTS_ERROR);
    });

    it("throws when trying to create profile for another user", async () => {
      const userId = await helpers.createUser("test@example.com");
      const targetUserId = await helpers.createUser("target@example.com");
      const profile = createTestProfile(userId);
      await helpers.createProfile(profile);

      const args = { userId: targetUserId, firstName: "New", lastName: "Name" };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, args),
      ).rejects.toThrow();
    });
  });

  describe("updateUserProfile", () => {
    it("updates user profile", async () => {
      const userId = await helpers.createUser();
      const profile = createTestProfile(userId);
      const profileId = await helpers.createProfile(profile);

      const args = { userId, firstName: "Updated" };
      const asUser = t.withIdentity({ subject: userId });

      await asUser.mutation(api.service.users.functions.updateUserProfile, args);

      const updatedProfile = await helpers.getProfile(profileId);
      expect(updatedProfile).toEqual(expect.objectContaining({ ...profile, firstName: "Updated" }));
    });

    it("allows admin to update any profile", async () => {
      const adminId = await helpers.createUser("admin@example.com");
      await helpers.createProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const targetUserId = await helpers.createUser("target@example.com");
      const targetProfileId = await helpers.createProfile({
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
      const userId = await helpers.createUser("user@example.com");
      await helpers.createProfile({
        firstName: "User",
        lastName: "One",
        isAdmin: false,
        userId,
      });

      const targetUserId = await helpers.createUser("target@example.com");
      await helpers.createProfile({
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
