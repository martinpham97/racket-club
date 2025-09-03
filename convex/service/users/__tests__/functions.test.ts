import { api } from "@/convex/_generated/api";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { ActivityTestHelpers } from "@/test-utils/samples/activities";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("User Functions", () => {
  const t = convexTest(schema);
  const helpers = new UserTestHelpers(t);
  const activityHelpers = new ActivityTestHelpers(t);

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

      const profileId = await asUser.mutation(api.service.users.functions.createUserProfile, args);

      expect(profileId).toBeDefined();
      const createdProfile = await helpers.getProfile(profileId);
      expect(createdProfile).toEqual(expect.objectContaining(profile));

      // Validate profile creation activity was created
      const activities = await activityHelpers.getActivitiesForResource(profileId);
      expect(activities).toHaveLength(1);
      expect(activities[0]).toEqual(
        expect.objectContaining({
          resourceId: profileId,
          type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
          createdBy: userId,
        }),
      );
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

      const profileId = await asAdmin.mutation(api.service.users.functions.createUserProfile, args);

      expect(profileId).toBeDefined();
      const createdProfile = await helpers.getProfile(profileId);
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

      // Validate profile update activity was created
      const activities = await activityHelpers.getActivitiesForResource(profileId);
      const updateActivity = activities.find((a) => a.type === ACTIVITY_TYPES.USER_PROFILE_UPDATED);
      expect(updateActivity).toBeDefined();
      expect(updateActivity?.createdBy).toBe(userId);
      expect(updateActivity?.resourceId).toBe(profileId);
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

    it("validates date of birth in createUserProfile", async () => {
      const userId = await helpers.insertUser();
      const futureDate = Date.now() + 24 * 60 * 60 * 1000;

      const args = {
        userId,
        firstName: "Test",
        lastName: "User",
        dob: futureDate,
      };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, args),
      ).rejects.toThrow("Date of birth cannot be in the future");
    });
  });

  describe("updateUserProfile", () => {
    it("validates date of birth in updateUserProfile", async () => {
      const userId = await helpers.insertUser();
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const futureDate = Date.now() + 24 * 60 * 60 * 1000;
      const args = { userId, dob: futureDate };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, args),
      ).rejects.toThrow("Date of birth cannot be in the future");
    });

    it("throws when profile doesn't exist for update", async () => {
      const adminId = await helpers.insertUser("admin@example.com");
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const userId = await helpers.insertUser();

      const args = { userId, firstName: "Updated" };
      const asUser = t.withIdentity({ subject: adminId });

      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, args),
      ).rejects.toThrow(USER_PROFILE_REQUIRED_ERROR);
    });
  });

  describe("listUserActivities", () => {
    it("returns user activities when user requests their own", async () => {
      const userId = await helpers.insertUser();
      const profile = createTestProfile(userId);
      const profileId = await helpers.insertProfile(profile);

      // Insert test activities
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        createdBy: userId,
        createdAt: Date.now(),
        date: Date.now(),
      });
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_UPDATED,
        createdBy: userId,
        createdAt: Date.now(),
        date: Date.now(),
      });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.listUserActivities, {
        userId,
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result).toBeDefined();
      expect(result.page).toHaveLength(2);
      expect(result.page.some((a) => a.type === ACTIVITY_TYPES.USER_PROFILE_CREATED)).toBe(true);
      expect(result.page.some((a) => a.type === ACTIVITY_TYPES.USER_PROFILE_UPDATED)).toBe(true);
    });

    it("throws when non-admin user tries to access another user's activities", async () => {
      const userId = await helpers.insertUser("user@example.com");
      const otherUserId = await helpers.insertUser("other@example.com");
      await helpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.users.functions.listUserActivities, {
          userId: otherUserId,
          pagination: { cursor: null, numItems: 10 },
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("allows admin to access any user's activities", async () => {
      const adminId = await helpers.insertUser("admin@example.com");
      const userId = await helpers.insertUser("user@example.com");
      await helpers.insertProfile(createTestProfile(adminId, { isAdmin: true }));
      const profileId = await helpers.insertProfile(createTestProfile(userId));

      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        createdBy: userId,
        createdAt: Date.now(),
        date: Date.now(),
      });

      const asAdmin = t.withIdentity({ subject: adminId });
      const result = await asAdmin.query(api.service.users.functions.listUserActivities, {
        userId,
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result).toBeDefined();
      expect(result.page).toHaveLength(1);
      expect(result.page[0].resourceId).toBe(profileId);
      expect(result.page[0].relatedId).toBe(userId);
    });
  });
});
