import { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import {
  createClub,
  deleteAllClubMemberships,
  getClub,
  getClubBanRecordForUser,
  getClubMembershipForUser,
  listAllClubMembers,
  listClubsForUser,
  listPublicClubs,
  updateClub,
} from "@/convex/service/clubs/database";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubBan,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

describe("Club Database Service", () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  describe("getClub", () => {
    it("returns club when found", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      const result = await t.run(async (ctx) => {
        return await getClub(ctx, clubId);
      });

      expect(result).not.toBeNull();
      expect(result!._id).toBe(clubId);
    });

    it("returns null when club not found", async () => {
      const result = await t.run(async (ctx) => {
        return await getClub(ctx, "invalid-id" as Id<"clubs">);
      });

      expect(result).toBeNull();
    });
  });

  describe("getClubMembershipForUser", () => {
    it("returns membership when user is member", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));

      const result = await t.run(async (ctx) => {
        return await getClubMembershipForUser(ctx, clubId, userId);
      });

      expect(result).not.toBeNull();
      expect(result!.clubId).toBe(clubId);
    });
    it("returns null when user is not member", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const otherUserId = await userHelpers.insertUser("other@test.com");

      const result = await t.run(async (ctx) => {
        return await getClubMembershipForUser(ctx, clubId, otherUserId);
      });

      expect(result).toBeNull();
    });
  });

  describe("listPublicClubs", () => {
    it("returns paginated public clubs", async () => {
      const userId = await userHelpers.insertUser();
      const club1 = createTestClub(userId, { name: "Public Club 1", isApproved: true });
      const club2 = createTestClub(userId, { name: "Public Club 2" });

      const clubId = await clubHelpers.insertClub(club1);
      await clubHelpers.insertClub(club2);

      const result = await t.run(async (ctx) => {
        return await listPublicClubs(ctx, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(1);
      expect(result.page.every((club) => club.createdBy === userId)).toBe(true);
      expect(result.page.every((club) => club.isApproved === true)).toBe(true);
      expect(result.page[0]._id).toBe(clubId);
    });
  });

  describe("listClubsForUser", () => {
    it("returns user's clubs with membership details", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.run(async (ctx) => {
        return await listClubsForUser(ctx, userId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].membership).toBeDefined();
      expect(result.page[0].membership.clubId).toBe(clubId);
    });

    it("filters out clubs that no longer exist", async () => {
      const userId = await userHelpers.insertUser();
      const clubId1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId2 = await clubHelpers.insertClub(createTestClub(userId));

      await clubHelpers.insertMembership(createTestClubMembership(clubId1, userId));
      await clubHelpers.insertMembership(createTestClubMembership(clubId2, userId));

      // Delete one club
      await t.run(async (ctx) => {
        await ctx.db.delete(clubId2);
      });

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.run(async (ctx) => {
        return await listClubsForUser(ctx, userId, { cursor: null, numItems: 10 });
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(clubId1);
    });
  });

  describe("createClub", () => {
    it("creates club with correct defaults", async () => {
      const userId = await userHelpers.insertUser();
      const input = createTestClub(userId);

      const clubId = await t.run(async (ctx) => {
        return await createClub(ctx, input, userId);
      });

      const club = await clubHelpers.getClubRecord(clubId);
      expect(club!.name).toBe(input.name);
      expect(club!.isApproved).toBe(false);
      expect(club!.createdBy).toBe(userId);
      expect(club!.numMembers).toBe(0);
    });
  });

  describe("updateClub", () => {
    it("updates club with provided data", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const updateData = { name: "Updated Club Name" };

      await t.run(async (ctx) => {
        await updateClub(ctx, clubId, updateData);
      });

      const club = await clubHelpers.getClubRecord(clubId);
      expect(club!.name).toBe("Updated Club Name");
    });
  });

  describe("getClubBanRecordForUser", () => {
    it("returns active ban when user is banned", async () => {
      const userId = await userHelpers.insertUser();
      const bannedUserId = await userHelpers.insertUser("banned@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId));
      const ban = createTestClubBan(clubId, bannedUserId, userId);

      await clubHelpers.insertClubBan(ban);

      const result = await t.run(async (ctx) => {
        return await getClubBanRecordForUser(ctx, clubId, bannedUserId);
      });

      expect(result).not.toBeNull();
      expect(result!.clubId).toBe(clubId);
      expect(result!.userId).toBe(bannedUserId);
    });

    it("returns null when user is not banned", async () => {
      const userId = await userHelpers.insertUser();
      const otherUserId = await userHelpers.insertUser("other@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      const result = await t.run(async (ctx) => {
        return await getClubBanRecordForUser(ctx, clubId, otherUserId);
      });

      expect(result).toBeNull();
    });
  });

  describe("deleteAllClubMemberships", () => {
    it("deletes all memberships and resets member count", async () => {
      const userId1 = await userHelpers.insertUser();
      const userId2 = await userHelpers.insertUser("user2@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId1, { numMembers: 2 }));

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId1));
      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId2));

      await t.run(async (ctx) => {
        await deleteAllClubMemberships(ctx, clubId);
      });

      const memberships = await t.run(async (ctx) => {
        return await listAllClubMembers(ctx, clubId);
      });
      const club = await clubHelpers.getClubRecord(clubId);

      expect(memberships).toHaveLength(0);
      expect(club!.numMembers).toBe(0);
    });

    it("handles empty membership list", async () => {
      const userId = await userHelpers.insertUser();
      const clubId = await clubHelpers.insertClub(createTestClub(userId));

      await t.run(async (ctx) => {
        await deleteAllClubMemberships(ctx, clubId);
      });

      const club = await clubHelpers.getClubRecord(clubId);
      expect(club!.numMembers).toBe(0);
    });
  });

  describe("listAllClubMembers", () => {
    it("returns all members for a club", async () => {
      const userId1 = await userHelpers.insertUser();
      const userId2 = await userHelpers.insertUser("user2@test.com");
      const clubId = await clubHelpers.insertClub(createTestClub(userId1));

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId1));
      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId2));

      const result = await t.run(async (ctx) => {
        return await listAllClubMembers(ctx, clubId);
      });

      expect(result).toHaveLength(2);
      expect(result.every((member) => member.clubId === clubId)).toBe(true);
    });
  });
});
