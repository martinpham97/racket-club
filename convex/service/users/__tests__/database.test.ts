import { AUTH_PROVIDER_NO_EMAIL_ERROR } from "@/convex/constants/errors";
import schema from "@/convex/schema";
import {
  createUserProfile,
  findUserByEmail,
  getCurrentUser,
  getOrCreateUser,
  getProfileByUserId,
  updateUserProfile,
} from "@/convex/service/users/database";
import { createTestProfile, generateTestEmail, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

describe("User Database Service", () => {
  const t = convexTest(schema);
  const userHelpers = new UserTestHelpers(t);

  describe("findUserByEmail", () => {
    it("returns user when found", async () => {
      const email = generateTestEmail();
      const userId = await userHelpers.insertUser(email);

      const result = await t.run(async (ctx) => {
        return await findUserByEmail(ctx, email);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(userId);
      expect(result!.email).toBe(email);
    });

    it("returns null when user not found", async () => {
      const result = await t.run(async (ctx) => {
        return await findUserByEmail(ctx, "nonexistent@example.com");
      });

      expect(result).toBeNull();
    });
  });

  describe("getCurrentUser", () => {
    it("returns user with profile when authenticated", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.run(async (ctx) => {
        return await getCurrentUser(ctx);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(userId);
      expect(result!.profile).not.toBeNull();
    });

    it("returns null when not authenticated", async () => {
      const result = await t.run(async (ctx) => {
        return await getCurrentUser(ctx);
      });

      expect(result).toBeNull();
    });

    it("returns null when authenticated user is deleted", async () => {
      const userId = await userHelpers.insertUser();

      // Delete the user
      await t.run(async (ctx) => {
        await ctx.db.delete(userId);
      });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.run(async (ctx) => {
        return await getCurrentUser(ctx);
      });

      expect(result).toBeNull();
    });
  });

  describe("getProfileByUserId", () => {
    it("returns profile when found", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      const profileId = await userHelpers.insertProfile(profile);

      const result = await t.run(async (ctx) => {
        return await getProfileByUserId(ctx, userId);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(profileId);
      expect(result!.userId).toBe(userId);
    });

    it("returns null when profile not found", async () => {
      const userId = await userHelpers.insertUser();

      const result = await t.run(async (ctx) => {
        return await getProfileByUserId(ctx, userId);
      });

      expect(result).toBeNull();
    });
  });

  describe("createUserProfile", () => {
    it("creates new profile when none exists", async () => {
      const userId = await userHelpers.insertUser();
      const input = createTestProfile(userId, { firstName: "John", lastName: "Doe" });

      const profileId = await t.run(async (ctx) => {
        return await createUserProfile(ctx, input);
      });

      const profile = await userHelpers.getProfile(profileId);
      expect(profile).not.toBeNull();
      expect(profile!.firstName).toBe("John");
      expect(profile!.lastName).toBe("Doe");
      expect(profile!.userId).toBe(userId);
    });
  });

  describe("updateUserProfile", () => {
    it("updates existing profile", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId, { firstName: "Original", lastName: "Name" });
      const profileId = await userHelpers.insertProfile(profile);
      const updateData = { userId, firstName: "Updated", lastName: "Name" };

      await t.run(async (ctx) => {
        await updateUserProfile(ctx, profileId, updateData);
      });

      const updatedProfile = await userHelpers.getProfile(profileId);
      expect(updatedProfile!.firstName).toBe("Updated");
      expect(updatedProfile!.lastName).toBe("Name");
    });
  });

  describe("getOrCreateUser", () => {
    it("returns existing user ID when provided", async () => {
      const existingUserId = await userHelpers.insertUser();
      const args = { existingUserId };

      const result = await t.run(async (ctx) => {
        return await getOrCreateUser(ctx, args);
      });

      expect(result).toBe(existingUserId);
    });

    it("throws error when no email provided", async () => {
      const args = {};

      await expect(
        t.run(async (ctx) => {
          return await getOrCreateUser(ctx, args);
        }),
      ).rejects.toThrow(AUTH_PROVIDER_NO_EMAIL_ERROR);
    });

    it("returns existing user ID when user found by email", async () => {
      const email = generateTestEmail("existing");
      const existingUserId = await userHelpers.insertUser(email);
      const args = { email };

      const result = await t.run(async (ctx) => {
        return await getOrCreateUser(ctx, args);
      });

      expect(result).toBe(existingUserId);
    });

    it("creates new user when not found", async () => {
      const email = generateTestEmail("new");
      const args = { email };

      const result = await t.run(async (ctx) => {
        return await getOrCreateUser(ctx, args);
      });

      const user = await t.run(async (ctx) => {
        return await ctx.db.get(result);
      });

      expect(user).not.toBeNull();
      expect(user!.email).toBe(email);
    });
  });
});
