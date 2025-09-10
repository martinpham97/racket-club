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
import { convexTest } from "@/convex/setup.testing";
import { createTestProfile, generateTestEmail, UserTestHelpers } from "@/test-utils/samples/users";
import { describe, expect, it } from "vitest";

describe("User Database Service", () => {
  const t = convexTest(schema);
  const userHelpers = new UserTestHelpers(t);

  describe("findUserByEmail", () => {
    it("returns user when found", async () => {
      const email = generateTestEmail();
      const user = await userHelpers.insertUser(email);
      const userId = user._id;

      const result = await t.runWithCtx((ctx) => findUserByEmail(ctx, email));

      expect(result).not.toBeNull();
      expect(result!._id).toBe(userId);
      expect(result!.email).toBe(email);
    });

    it("returns null when user not found", async () => {
      const result = await t.runWithCtx((ctx) => findUserByEmail(ctx, "nonexistent@example.com"));

      expect(result).toBeNull();
    });
  });

  describe("getCurrentUser", () => {
    it("returns user with profile when authenticated", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));

      const result = await t.runAsUser(userId)((ctx) => getCurrentUser(ctx));

      expect(result).not.toBeNull();
      expect(result!._id).toBe(userId);
      expect(result!.profile).toEqual(profile);
      expect(result!.email).toBe(user.email);
    });

    it("returns null when not authenticated", async () => {
      const result = await t.runWithCtx((ctx) => getCurrentUser(ctx));

      expect(result).toBeNull();
    });

    it("returns null when authenticated user is deleted", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      // Delete the user
      await userHelpers.deleteUser(userId);

      const result = await t.runAsUser(userId)((ctx) => getCurrentUser(ctx));

      expect(result).toBeNull();
    });
  });

  describe("getProfileByUserId", () => {
    it("returns profile when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));

      const result = await t.runWithCtx((ctx) => getProfileByUserId(ctx, userId));

      expect(result).toEqual(profile);
    });

    it("returns null when profile not found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const result = await t.runWithCtx((ctx) => getProfileByUserId(ctx, userId));

      expect(result).toBeNull();
    });
  });

  describe("createUserProfile", () => {
    it("creates new profile when none exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const input = createTestProfile(userId, { firstName: "John", lastName: "Doe" });

      const profile = await t.runWithCtx((ctx) => createUserProfile(ctx, userId, input));

      expect(profile).not.toBeNull();
      expect(profile!.firstName).toBe("John");
      expect(profile!.lastName).toBe("Doe");
      expect(profile!.userId).toBe(userId);
    });
  });

  describe("updateUserProfile", () => {
    it("updates existing profile and returns updated profile", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(
        createTestProfile(userId, { firstName: "Original", lastName: "Name" }),
      );
      const profileId = profile._id;
      const updateData = { userId, firstName: "Updated", lastName: "Name" };

      const updatedProfile = await t.runWithCtx((ctx) =>
        updateUserProfile(ctx, profileId, updateData),
      );

      expect(updatedProfile.firstName).toBe("Updated");
      expect(updatedProfile.lastName).toBe("Name");
      expect(updatedProfile._id).toBe(profileId);
      expect(updatedProfile.userId).toBe(userId);

      // Validate with separate database fetch
      const fetchedProfile = await userHelpers.getProfile(profileId);
      expect(fetchedProfile!.firstName).toBe("Updated");
      expect(fetchedProfile!.lastName).toBe("Name");
    });
  });

  describe("getOrCreateUser", () => {
    it("returns existing user ID when provided", async () => {
      const user = await userHelpers.insertUser();
      const existingUserId = user._id;
      const args = { existingUserId };

      const result = await t.runWithCtx((ctx) => getOrCreateUser(ctx, args));

      expect(result).toBe(existingUserId);
    });

    it("throws error when no email provided", async () => {
      const args = {};

      await expect(t.runWithCtx((ctx) => getOrCreateUser(ctx, args))).rejects.toThrow(
        AUTH_PROVIDER_NO_EMAIL_ERROR,
      );
    });

    it("returns existing user ID when user found by email", async () => {
      const email = generateTestEmail("existing");
      const user = await userHelpers.insertUser(email);
      const existingUserId = user._id;
      const args = { email };

      const result = await t.runWithCtx((ctx) => getOrCreateUser(ctx, args));

      expect(result).toBe(existingUserId);
    });

    it("creates new user when not found", async () => {
      const email = generateTestEmail("new");
      const args = { email };

      const result = await t.runWithCtx((ctx) => getOrCreateUser(ctx, args));

      const user = await userHelpers.getUser(result);
      expect(user).not.toBeNull();
      expect(user!.email).toBe(email);
    });
  });
});
