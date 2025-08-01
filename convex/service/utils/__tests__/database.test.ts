import { UserProfile } from "@/convex/service/users/schemas";
import { rlsRules } from "@/convex/service/utils/database";
import { createTestProfileRecord, createTestUserRecord } from "@/test-utils/samples/users";
import { describe, expect, it } from "vitest";

describe("rlsRules", () => {
  const mockCtx = {} as any;
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
});
