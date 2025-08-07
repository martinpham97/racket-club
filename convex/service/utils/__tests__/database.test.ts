import { MutationCtx } from "@/convex/_generated/server";
import { UserProfile } from "@/convex/service/users/schemas";
import { rlsRules } from "@/convex/service/utils/database";
import { createTestClubBan, createTestClubBanRecord } from "@/test-utils/samples/clubs";
import { genId } from "@/test-utils/samples/id";
import { createTestProfileRecord, createTestUserRecord } from "@/test-utils/samples/users";
import { describe, expect, it } from "vitest";

describe("rlsRules", () => {
  const mockCtx = {} as MutationCtx;
  const user = createTestUserRecord();
  const userNoProfile = createTestUserRecord({ profile: null });
  const adminUser = createTestUserRecord({ profile: { isAdmin: true } });

  describe("users table", () => {
    it("allows read for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.users.read()).toBe(true);
    });

    it("allows insert for anyone", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.users.insert()).toBe(true);
    });

    it("allows modify for admin users", async () => {
      const rules = await rlsRules(mockCtx, adminUser);

      expect(await rules.users.modify()).toBe(true);
    });

    it("denies modify for non-admin users", async () => {
      const rules = await rlsRules(mockCtx, user);

      expect(await rules.users.modify()).toBe(false);
    });
  });

  describe("userProfiles table", () => {
    it("allows read for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.userProfiles.read()).toBe(true);
    });

    it("allows insert for own profile", async () => {
      const rules = await rlsRules(mockCtx, userNoProfile);
      const profile = createTestProfileRecord(userNoProfile._id);

      expect(await rules.userProfiles.insert(mockCtx, profile)).toBe(true);
    });

    it("denies insert for other user's profile", async () => {
      const rules = await rlsRules(mockCtx, user);
      const profile = createTestProfileRecord(userNoProfile._id);

      expect(await rules.userProfiles.insert(mockCtx, profile)).toBe(false);
    });

    it("allows modify for own profile", async () => {
      const rules = await rlsRules(mockCtx, user);
      const profile = createTestProfileRecord(user._id);

      expect(await rules.userProfiles.modify(mockCtx, profile)).toBe(true);
    });

    it("allows modify for admin", async () => {
      const rules = await rlsRules(mockCtx, adminUser);
      const userProfile = user.profile as UserProfile;

      expect(await rules.userProfiles.modify(mockCtx, { ...userProfile, isAdmin: true })).toBe(
        true,
      );
    });

    it("denies modify for other user's profile", async () => {
      const rules = await rlsRules(mockCtx, user);
      const adminProfile = adminUser.profile as UserProfile;

      expect(await rules.userProfiles.modify(mockCtx, { ...adminProfile, firstName: "test" })).toBe(
        false,
      );
    });
  });

  describe("clubs table", () => {
    it("allows read for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubs.read()).toBe(true);
    });

    it("allows insert for authenticated users", async () => {
      const rules = await rlsRules(mockCtx, user);

      expect(await rules.clubs.insert()).toBe(true);
    });

    it("denies insert for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubs.insert()).toBe(false);
    });

    it("allows modify for authenticated users", async () => {
      const rules = await rlsRules(mockCtx, user);

      expect(await rules.clubs.modify()).toBe(true);
    });

    it("denies modify for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubs.modify()).toBe(false);
    });
  });

  describe("clubMemberships table", () => {
    it("allows read for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubMemberships.read()).toBe(true);
    });

    it("allows insert for authenticated users", async () => {
      const rules = await rlsRules(mockCtx, user);

      expect(await rules.clubMemberships.insert()).toBe(true);
    });

    it("denies insert for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubMemberships.insert()).toBe(false);
    });

    it("allows modify for authenticated users", async () => {
      const rules = await rlsRules(mockCtx, user);

      expect(await rules.clubMemberships.modify()).toBe(true);
    });

    it("denies modify for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubMemberships.modify()).toBe(false);
    });
  });

  describe("clubBans table", () => {
    it("allows read for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);

      expect(await rules.clubBans.read()).toBe(true);
    });

    it("allows insert when banning other users", async () => {
      const rules = await rlsRules(mockCtx, user);
      const otherUser = createTestUserRecord();
      const ban = createTestClubBan(genId("clubs"), otherUser._id, user._id);

      expect(await rules.clubBans.insert(mockCtx, ban)).toBe(true);
    });

    it("denies insert when trying to ban self", async () => {
      const rules = await rlsRules(mockCtx, user);
      const ban = createTestClubBan(genId("clubs"), user._id, user._id);

      expect(await rules.clubBans.insert(mockCtx, ban)).toBe(false);
    });

    it("allows insert for admin when banning other users", async () => {
      const rules = await rlsRules(mockCtx, adminUser);
      const otherUser = createTestUserRecord();
      const ban = createTestClubBan(genId("clubs"), otherUser._id, adminUser._id);

      expect(await rules.clubBans.insert(mockCtx, ban)).toBe(true);
    });

    it("denies insert for admin when trying to ban self", async () => {
      const rules = await rlsRules(mockCtx, adminUser);
      const ban = createTestClubBan(genId("clubs"), adminUser._id, adminUser._id);

      expect(await rules.clubBans.insert(mockCtx, ban)).toBe(false);
    });

    it("allows modify when modifying other user's ban", async () => {
      const rules = await rlsRules(mockCtx, user);
      const otherUser = createTestUserRecord();
      const ban = createTestClubBanRecord(genId("clubs"), otherUser._id, user._id);

      expect(await rules.clubBans.modify(mockCtx, ban)).toBe(true);
    });

    it("denies modify when trying to modify own ban", async () => {
      const rules = await rlsRules(mockCtx, user);
      const ban = createTestClubBanRecord(genId("clubs"), user._id, adminUser._id);

      expect(await rules.clubBans.modify(mockCtx, ban)).toBe(false);
    });

    it("allows modify for admin when modifying other user's ban", async () => {
      const rules = await rlsRules(mockCtx, adminUser);
      const otherUser = createTestUserRecord();
      const ban = createTestClubBanRecord(genId("clubs"), otherUser._id, user._id);

      expect(await rules.clubBans.modify(mockCtx, ban)).toBe(true);
    });

    it("denies modify for admin when trying to modify own ban", async () => {
      const rules = await rlsRules(mockCtx, adminUser);
      const ban = createTestClubBanRecord(genId("clubs"), adminUser._id, user._id);

      expect(await rules.clubBans.modify(mockCtx, ban)).toBe(false);
    });

    it("denies insert for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);
      const ban = createTestClubBan();

      expect(await rules.clubBans.insert(mockCtx, ban)).toBe(false);
    });

    it("denies modify for unauthenticated users", async () => {
      const rules = await rlsRules(mockCtx);
      const ban = createTestClubBanRecord();

      expect(await rules.clubBans.modify(mockCtx, ban)).toBe(false);
    });
  });
});
