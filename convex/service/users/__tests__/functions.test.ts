import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  USER_PROFILE_ALREADY_EXISTS_ERROR,
  USER_PROFILE_REQUIRED_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { convexTest } from "@/convex/setup.testing";
import { ActivityTestHelpers } from "@/test-utils/samples/activities";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("User Functions", () => {
  let t: ReturnType<typeof convexTest>;
  let helpers: UserTestHelpers;
  let activityHelpers: ActivityTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    helpers = new UserTestHelpers(t);
    activityHelpers = new ActivityTestHelpers(t);
  });

  describe("getCurrentUser", () => {
    it("returns null when not authenticated", async () => {
      const result = await t.query(api.service.users.functions.getCurrentUser, {});
      expect(result).toBeNull();
    });

    it("returns user with profile when authenticated", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.getCurrentUser, {});

      expect(result).not.toBeNull();
      expect(result?.profile).toEqual(profile);
    });
  });

  describe("createUserProfile", () => {
    it("creates user profile", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const input = { userId, firstName: "test", lastName: "profile" };

      const asUser = t.withIdentity({ subject: userId });
      const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
        input,
      });
      const profileId = profile._id;

      // Validate output
      expect(profile).toEqual(expect.objectContaining(input));

      // Validate in DB
      const createdProfile = await helpers.getProfile(profileId);
      expect(createdProfile).toEqual(expect.objectContaining(profile));

      // Validate profile creation activity was created
      const activities = await activityHelpers.getActivitiesForResource(profileId);
      expect(activities).toHaveLength(1);
      expect(activities[0]).toEqual(
        expect.objectContaining({
          resourceId: profileId,
          type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        }),
      );
    });

    it("allows admin to create profile for any user", async () => {
      const admin = await helpers.insertUser("admin@example.com");
      const adminId = admin._id;
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const targetUser = await helpers.insertUser("target@example.com");
      const targetUserId = targetUser._id;

      const input = {
        firstName: "test",
        lastName: "user",
        userId: targetUserId,
      };

      const asUser = t.withIdentity({ subject: adminId });
      const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
        input,
      });
      const profileId = profile._id;

      expect(profile).toEqual(expect.objectContaining(input));

      const createdProfile = await helpers.getProfile(profileId);
      expect(createdProfile).toEqual(expect.objectContaining(profile));
    });

    it("throws when profile already exists", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const input = { firstName: "New", lastName: "Name", userId };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, { input }),
      ).rejects.toThrow(USER_PROFILE_ALREADY_EXISTS_ERROR);
    });

    it("throws when trying to create profile for another user", async () => {
      const user = await helpers.insertUser("test@example.com");
      const userId = user._id;
      const targetUser = await helpers.insertUser("target@example.com");
      const targetUserId = targetUser._id;
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const input = { firstName: "New", lastName: "Name", userId: targetUserId };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, { input }),
      ).rejects.toThrow();
    });
  });

  describe("updateUserProfile", () => {
    it("updates user profile", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      const input = { firstName: "Updated", userId };
      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.users.functions.updateUserProfile, { input });

      const updatedProfile = await helpers.getProfile(profileId);
      expect(updatedProfile).toEqual(expect.objectContaining({ ...profile, firstName: "Updated" }));

      // Validate profile update activity was created
      const activities = await activityHelpers.getActivitiesForResource(profileId);
      const updateActivity = activities.find((a) => a.type === ACTIVITY_TYPES.USER_PROFILE_UPDATED);
      expect(updateActivity).toBeDefined();
      expect(updateActivity?.resourceId).toBe(profileId);
    });

    it("allows admin to update any profile", async () => {
      const admin = await helpers.insertUser("admin@example.com");
      const adminId = admin._id;
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const targetUser = await helpers.insertUser("target@example.com");
      const targetUserId = targetUser._id;
      const targetProfile = await helpers.insertProfile({
        firstName: "Target",
        lastName: "User",
        isAdmin: false,
        userId: targetUserId,
      });
      const targetProfileId = targetProfile._id;

      const input = { firstName: "AdminUpdated", userId: targetUserId };
      const asAdmin = t.withIdentity({ subject: adminId });
      await asAdmin.mutation(api.service.users.functions.updateUserProfile, { input });

      const updatedProfile = await helpers.getProfile(targetProfileId);
      expect(updatedProfile?.firstName).toBe("AdminUpdated");
    });

    it("rejects when non-admin user tries to modify another user", async () => {
      const user = await helpers.insertUser("user@example.com");
      const userId = user._id;
      await helpers.insertProfile({
        firstName: "User",
        lastName: "One",
        isAdmin: false,
        userId,
      });

      const targetUser = await helpers.insertUser("target@example.com");
      const targetUserId = targetUser._id;
      await helpers.insertProfile({
        firstName: "Target",
        lastName: "User",
        isAdmin: false,
        userId: targetUserId,
      });

      const input = { firstName: "Hacked", userId: targetUserId };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, { input }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("validates date of birth in createUserProfile", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const futureDate = Date.now() + 24 * 60 * 60 * 1000;

      const input = {
        firstName: "Test",
        lastName: "User",
        dob: futureDate,
        userId,
      };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, { input }),
      ).rejects.toThrow("Date of birth cannot be in the future");
    });

    it("throws when not authenticated", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const input = { firstName: "Test", lastName: "User", userId };

      await expect(
        t.mutation(api.service.users.functions.createUserProfile, { input }),
      ).rejects.toThrow();
    });

    it("throws when user doesn't exist", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const fakeUserId = "fake_user_id" as Id<"users">;
      const input = { firstName: "Test", lastName: "User", userId: fakeUserId };

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.users.functions.createUserProfile, { input }),
      ).rejects.toThrow();
    });
  });

  describe("updateUserProfile", () => {
    it("validates date of birth in updateUserProfile", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const futureDate = Date.now() + 24 * 60 * 60 * 1000;
      const input = { dob: futureDate, userId };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, { input }),
      ).rejects.toThrow("Date of birth cannot be in the future");
    });

    it("throws when profile doesn't exist for update", async () => {
      const admin = await helpers.insertUser("admin@example.com");
      const adminId = admin._id;
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const user = await helpers.insertUser();
      const userId = user._id;

      const input = { firstName: "Updated", userId };
      const asAdmin = t.withIdentity({ subject: adminId });
      await expect(
        asAdmin.mutation(api.service.users.functions.updateUserProfile, { input }),
      ).rejects.toThrow(USER_PROFILE_REQUIRED_ERROR);
    });

    it("accepts valid past date of birth", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const pastDate = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago
      const input = { dob: pastDate, userId };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, { input }),
      ).resolves.not.toThrow();
    });

    it("accepts undefined date of birth", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = createTestProfile(userId);
      await helpers.insertProfile(profile);

      const input = { firstName: "Updated", userId };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.users.functions.updateUserProfile, { input }),
      ).resolves.not.toThrow();
    });
  });

  describe("getCurrentUser edge cases", () => {
    it("returns user without profile when profile doesn't exist", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.getCurrentUser, {});

      expect(result).not.toBeNull();
      expect(result?.profile).toBeNull();
      expect(result?._id).toBe(userId);
    });
  });

  describe("createUserProfile validation", () => {
    it("accepts valid past date of birth in createUserProfile", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const pastDate = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago

      const input = {
        firstName: "Test",
        lastName: "User",
        dob: pastDate,
        userId,
      };
      const asUser = t.withIdentity({ subject: userId });

      const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
        input,
      });
      expect(profile).toBeDefined();
      expect(profile.dob).toBe(pastDate);
    });

    it("accepts undefined date of birth in createUserProfile", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;

      const input = {
        firstName: "Test",
        lastName: "User",
        userId,
      };
      const asUser = t.withIdentity({ subject: userId });

      const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
        input,
      });
      expect(profile).toBeDefined();
      expect(profile.dob).toBeUndefined();
    });

    it("creates profile with all optional fields", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;

      const input = {
        firstName: "Test",
        lastName: "User",
        gender: "M" as const,
        skillLevel: "B" as const,
        preferredPlayStyle: "MS" as const,
        userId,
      };
      const asUser = t.withIdentity({ subject: userId });

      const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
        input,
      });
      expect(profile).toEqual(expect.objectContaining(input));
    });
  });

  describe("listUserActivities", () => {
    it("lists user activities", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      // Create some activities
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        date: Date.now(),
        createdAt: Date.now(),
      });

      const args = { userId, pagination: { numItems: 10, cursor: null } };
      const asUser = t.withIdentity({ subject: userId });

      const result = await asUser.query(api.service.users.functions.listUserActivities, args);

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual(
        expect.objectContaining({
          resourceId: profileId,
          type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        }),
      );
    });

    it("throws when non-admin tries to access other user activities", async () => {
      const user = await helpers.insertUser("user@example.com");
      const userId = user._id;
      await helpers.insertProfile(createTestProfile(userId));

      const targetUser = await helpers.insertUser("target@example.com");
      const targetUserId = targetUser._id;

      const args = { userId: targetUserId, pagination: { numItems: 10, cursor: null } };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.query(api.service.users.functions.listUserActivities, args),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("returns user activities when user requests their own", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      // Insert test activities
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        createdAt: Date.now(),
        date: Date.now(),
      });
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_UPDATED,
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

    it("allows admin to access any user's activities", async () => {
      const admin = await helpers.insertUser("admin@example.com");
      const adminId = admin._id;
      const user = await helpers.insertUser("user@example.com");
      const userId = user._id;
      await helpers.insertProfile({ ...createTestProfile(adminId), isAdmin: true });
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
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

    it("respects pagination numItems limit", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      // Create multiple activities
      for (let i = 0; i < 5; i++) {
        await activityHelpers.insertActivity({
          resourceId: profileId,
          relatedId: userId,
          type: ACTIVITY_TYPES.USER_PROFILE_UPDATED,
          createdAt: Date.now() + i,
          date: Date.now() + i,
        });
      }

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.listUserActivities, {
        userId,
        pagination: { cursor: null, numItems: 3 },
      });

      expect(result.page).toHaveLength(3);
    });

    it("returns empty list when user has no activities", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      await helpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.users.functions.listUserActivities, {
        userId,
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(0);
    });

    it("throws when profile doesn't exist for update", async () => {
      const admin = await helpers.insertUser("admin@example.com");
      const adminId = admin._id;
      await helpers.insertProfile({
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
        userId: adminId,
      });

      const user = await helpers.insertUser();
      const userId = user._id;

      const input = { firstName: "Updated", userId };
      const asAdmin = t.withIdentity({ subject: adminId });
      await expect(
        asAdmin.mutation(api.service.users.functions.updateUserProfile, { input }),
      ).rejects.toThrow(USER_PROFILE_REQUIRED_ERROR);
    });
  });

  describe("listUserActivities", () => {
    it("lists user activities", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      // Create some activities
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        date: Date.now(),
        createdAt: Date.now(),
      });

      const args = { userId, pagination: { numItems: 10, cursor: null } };
      const asUser = t.withIdentity({ subject: userId });

      const result = await asUser.query(api.service.users.functions.listUserActivities, args);

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual(
        expect.objectContaining({
          resourceId: profileId,
          type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        }),
      );
    });

    it("throws when non-admin tries to access other user activities", async () => {
      const user = await helpers.insertUser("user@example.com");
      const userId = user._id;
      await helpers.insertProfile(createTestProfile(userId));

      const targetUser = await helpers.insertUser("target@example.com");
      const targetUserId = targetUser._id;

      const args = { userId: targetUserId, pagination: { numItems: 10, cursor: null } };
      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.query(api.service.users.functions.listUserActivities, args),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("returns user activities when user requests their own", async () => {
      const user = await helpers.insertUser();
      const userId = user._id;
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      // Insert test activities
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
        createdAt: Date.now(),
        date: Date.now(),
      });
      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_UPDATED,
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
      const user = await helpers.insertUser("user@example.com");
      const otherUser = await helpers.insertUser("other@example.com");
      const userId = user._id;
      const otherUserId = otherUser._id;
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
      const admin = await helpers.insertUser("admin@example.com");
      const adminId = admin._id;
      const user = await helpers.insertUser("user@example.com");
      const userId = user._id;
      await helpers.insertProfile(createTestProfile(adminId, { isAdmin: true }));
      const profile = await helpers.insertProfile(createTestProfile(userId));
      const profileId = profile._id;

      await activityHelpers.insertActivity({
        resourceId: profileId,
        relatedId: userId,
        type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
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
