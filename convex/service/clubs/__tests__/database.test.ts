import { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import {
  createClub,
  deleteAllClubMemberships,
  getActiveClubBanRecordForUser,
  getActiveClubBanRecords,
  getClubMembershipForUser,
  getClubMembershipOrThrow,
  getClubOrThrow,
  listAllClubMembers,
  listClubsForUser,
  listPublicClubs,
  listUserClubIds,
  updateClub,
  updateClubMembership,
} from "@/convex/service/clubs/database";
import { convexTest } from "@/convex/setup.testing";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubBan,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

describe("Club Database Service", () => {
  let t: ReturnType<typeof convexTest>;
  let clubHelpers: ClubTestHelpers;
  let userHelpers: UserTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    clubHelpers = new ClubTestHelpers(t);
    userHelpers = new UserTestHelpers(t);
  });

  describe("getClubOrThrow", () => {
    it("returns club when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx((ctx) => getClubOrThrow(ctx, clubId));

      expect(result._id).toBe(clubId);
    });

    it("throws when club not found", async () => {
      await expect(
        t.runWithCtx((ctx) => getClubOrThrow(ctx, "invalid-id" as Id<"clubs">)),
      ).rejects.toThrow();
    });
  });

  describe("getClubMembershipOrThrow", () => {
    it("returns membership when found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const membership = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId),
      );
      const membershipId = membership._id;

      const result = await t.runWithCtx((ctx) => getClubMembershipOrThrow(ctx, membershipId));

      expect(result._id).toBe(membershipId);
      expect(result.clubId).toBe(clubId);
    });

    it("throws when membership not found", async () => {
      await expect(
        t.runWithCtx((ctx) => getClubMembershipOrThrow(ctx, "invalid-id" as Id<"clubMemberships">)),
      ).rejects.toThrow();
    });
  });

  describe("getClubMembershipForUser", () => {
    it("returns correct membership with multiple memberships for same user", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = await clubHelpers.insertClub(createTestClub(userId));
      const club2 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId1 = club1._id;
      const clubId2 = club2._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId1, userId));
      await clubHelpers.insertMembership(createTestClubMembership(clubId2, userId));

      const result1 = await t.runWithCtx((ctx) => getClubMembershipForUser(ctx, clubId1, userId));
      const result2 = await t.runWithCtx((ctx) => getClubMembershipForUser(ctx, clubId2, userId));

      expect(result1).not.toBeNull();
      expect(result1!.clubId).toBe(clubId1);
      expect(result2).not.toBeNull();
      expect(result2!.clubId).toBe(clubId2);
    });

    it("returns null when user is not member", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const otherUser = await userHelpers.insertUser("other@test.com");
      const otherUserId = otherUser._id;

      const result = await t.runWithCtx((ctx) =>
        getClubMembershipForUser(ctx, clubId, otherUserId),
      );

      expect(result).toBeNull();
    });
  });

  describe("listPublicClubs", () => {
    it("returns paginated public clubs", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = createTestClub(userId, { name: "Public Club 1", isApproved: true });
      const club2 = createTestClub(userId, { name: "Public Club 2" });

      const insertedClub1 = await clubHelpers.insertClub(club1);
      const clubId = insertedClub1._id;
      await clubHelpers.insertClub(club2);

      const result = await t.runWithCtx((ctx) =>
        listPublicClubs(ctx, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(1);
      expect(result.page.every((club) => club.createdBy === userId)).toBe(true);
      expect(result.page.every((club) => club.isApproved === true)).toBe(true);
      expect(result.page[0]._id).toBe(clubId);
    });

    it("returns empty page when no public clubs exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));
      await clubHelpers.insertClub(createTestClub(userId, { isPublic: true, isApproved: false }));

      const result = await t.runWithCtx((ctx) =>
        listPublicClubs(ctx, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("returns clubs sorted by name in ascending order", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await clubHelpers.insertClub(createTestClub(userId, { name: "Z Club", isApproved: true }));
      await clubHelpers.insertClub(createTestClub(userId, { name: "A Club", isApproved: true }));
      await clubHelpers.insertClub(createTestClub(userId, { name: "M Club", isApproved: true }));

      const result = await t.runWithCtx((ctx) =>
        listPublicClubs(ctx, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(3);
      expect(result.page[0].name).toBe("A Club");
      expect(result.page[1].name).toBe("M Club");
      expect(result.page[2].name).toBe("Z Club");
    });

    it("handles pagination correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await clubHelpers.insertClub(createTestClub(userId, { name: "Club 1", isApproved: true }));
      await clubHelpers.insertClub(createTestClub(userId, { name: "Club 2", isApproved: true }));
      await clubHelpers.insertClub(createTestClub(userId, { name: "Club 3", isApproved: true }));

      const firstPage = await t.runWithCtx((ctx) =>
        listPublicClubs(ctx, { cursor: null, numItems: 2 }),
      );
      const secondPage = await t.runWithCtx((ctx) =>
        listPublicClubs(ctx, { cursor: firstPage.continueCursor, numItems: 2 }),
      );

      expect(firstPage.page).toHaveLength(2);
      expect(secondPage.page).toHaveLength(1);
      expect(firstPage.isDone).toBe(false);
      expect(secondPage.isDone).toBe(true);
    });
  });

  describe("listClubsForUser", () => {
    it("returns user's clubs with membership details", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));

      const result = await t.runWithCtx((ctx) =>
        listClubsForUser(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(1);
      expect(result.page[0].membership).toBeDefined();
      expect(result.page[0].membership.clubId).toBe(clubId);
    });

    it("filters out clubs that no longer exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId1 = club1._id;
      const club2 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId2 = club2._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId1, userId));
      await clubHelpers.insertMembership(createTestClubMembership(clubId2, userId));

      await t.runWithCtx((ctx) => ctx.table("clubs").getX(clubId2).delete());

      const result = await t.runWithCtx((ctx) =>
        listClubsForUser(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(clubId1);
    });

    it("returns empty page when user has no memberships", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const result = await t.runWithCtx((ctx) =>
        listClubsForUser(ctx, userId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("handles pagination correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const clubs = [];
      for (let i = 0; i < 3; i++) {
        const club = await clubHelpers.insertClub(createTestClub(userId));
        clubs.push(club);
        await clubHelpers.insertMembership(createTestClubMembership(club._id, userId));
      }

      const firstPage = await t.runWithCtx((ctx) =>
        listClubsForUser(ctx, userId, { cursor: null, numItems: 2 }),
      );
      const secondPage = await t.runWithCtx((ctx) =>
        listClubsForUser(ctx, userId, { cursor: firstPage.continueCursor, numItems: 2 }),
      );

      expect(firstPage.page).toHaveLength(2);
      expect(secondPage.page).toHaveLength(1);
      expect(firstPage.isDone).toBe(false);
      expect(secondPage.isDone).toBe(true);
    });
  });

  describe("createClub", () => {
    it("creates club with correct defaults", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const input = createTestClub(userId);

      const createdClub = await t.runWithCtx((ctx) => createClub(ctx, input, userId));
      const clubId = createdClub._id;

      const club = await clubHelpers.getClub(clubId);
      expect(club!.name).toBe(input.name);
      expect(club!.isApproved).toBe(false);
      expect(club!.createdBy).toBe(userId);
      expect(club!.numMembers).toBe(0);

      expect(createdClub.name).toBe(input.name);
      expect(createdClub.isPublic).toBe(input.isPublic);
      expect(createdClub.maxMembers).toBe(input.maxMembers);
      expect(createdClub.location).toEqual(input.location);
    });
  });

  describe("updateClub", () => {
    it("updates club with provided data and returns updated club", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const updateData = { name: "Updated Club Name" };

      const updatedClub = await t.runWithCtx((ctx) => updateClub(ctx, clubId, updateData));

      expect(updatedClub.name).toBe("Updated Club Name");
      expect(updatedClub._id).toBe(clubId);

      // Validate with separate database fetch
      const fetchedClub = await clubHelpers.getClub(clubId);
      expect(fetchedClub!.name).toBe("Updated Club Name");
    });

    it("throws when club doesn't exist", async () => {
      await expect(
        t.runWithCtx((ctx) => updateClub(ctx, "invalid-id" as Id<"clubs">, { name: "Test" })),
      ).rejects.toThrow();
    });

    it("partial updates don't affect other fields", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(
        createTestClub(userId, { name: "Original", isPublic: true }),
      );
      const clubId = club._id;

      const updatedClub = await t.runWithCtx((ctx) => updateClub(ctx, clubId, { name: "Updated" }));

      expect(updatedClub.name).toBe("Updated");
      expect(updatedClub.isPublic).toBe(true);
      expect(updatedClub.maxMembers).toBe(club.maxMembers);
    });
  });

  describe("updateClubMembership", () => {
    it("updates membership with provided data and returns updated membership", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const membership = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId),
      );
      const membershipId = membership._id;
      const updateData = { name: "Updated Member Name" };

      const updatedMembership = await t.runWithCtx((ctx) =>
        updateClubMembership(ctx, membershipId, updateData),
      );

      expect(updatedMembership.name).toBe("Updated Member Name");
      expect(updatedMembership._id).toBe(membershipId);

      // Validate with separate database fetch
      const fetchedMembership = await clubHelpers.getMembership(membershipId);
      expect(fetchedMembership!.name).toBe("Updated Member Name");
    });

    it("throws when membership doesn't exist", async () => {
      await expect(
        t.runWithCtx((ctx) =>
          updateClubMembership(ctx, "invalid-id" as Id<"clubMemberships">, { name: "Test" }),
        ),
      ).rejects.toThrow();
    });

    it("partial updates don't affect other fields", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const membership = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId, { name: "Original Name", isApproved: true }),
      );
      const membershipId = membership._id;

      const updatedMembership = await t.runWithCtx((ctx) =>
        updateClubMembership(ctx, membershipId, { name: "Updated Name" }),
      );

      expect(updatedMembership.name).toBe("Updated Name");
      expect(updatedMembership.isApproved).toBe(true);
    });
  });
  describe("getActiveClubBanRecordForUser", () => {
    it("returns correct ban with multiple bans for same user", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const bannedUser = await userHelpers.insertUser("banned@test.com");
      const bannedUserId = bannedUser._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUserId, userId, { isActive: false }),
      );
      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUserId, userId, { isActive: true }),
      );

      const result = await t.runWithCtx((ctx) =>
        getActiveClubBanRecordForUser(ctx, clubId, bannedUserId),
      );

      expect(result).not.toBeNull();
      expect(result!.isActive).toBe(true);
    });

    it("returns null when user is not banned", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const otherUser = await userHelpers.insertUser("other@test.com");
      const otherUserId = otherUser._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx((ctx) =>
        getActiveClubBanRecordForUser(ctx, clubId, otherUserId),
      );

      expect(result).toBeNull();
    });

    it("returns null when user has inactive bans", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const bannedUser = await userHelpers.insertUser("banned@test.com");
      const bannedUserId = bannedUser._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;
      const inactiveBan = createTestClubBan(clubId, bannedUserId, userId, { isActive: false });

      await clubHelpers.insertClubBan(inactiveBan);

      const result = await t.runWithCtx((ctx) =>
        getActiveClubBanRecordForUser(ctx, clubId, bannedUserId),
      );

      expect(result).toBeNull();
    });
  });

  describe("getActiveClubBanRecords", () => {
    it("returns paginated active bans for club", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const bannedUser1 = await userHelpers.insertUser("banned1@test.com");
      const bannedUser2 = await userHelpers.insertUser("banned2@test.com");
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await clubHelpers.insertClubBan(createTestClubBan(clubId, bannedUser1._id, userId));
      await clubHelpers.insertClubBan(createTestClubBan(clubId, bannedUser2._id, userId));
      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUser1._id, userId, { isActive: false }),
      );

      const result = await t.runWithCtx((ctx) =>
        getActiveClubBanRecords(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(2);
      expect(result.page.every((ban) => ban.clubId === clubId && ban.isActive)).toBe(true);
    });

    it("returns empty page when no active bans exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx((ctx) =>
        getActiveClubBanRecords(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(0);
    });

    it("filters inactive bans correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const bannedUser1 = await userHelpers.insertUser("banned1@test.com");
      const bannedUser2 = await userHelpers.insertUser("banned2@test.com");
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUser1._id, userId, { isActive: true }),
      );
      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUser2._id, userId, { isActive: false }),
      );

      const result = await t.runWithCtx((ctx) =>
        getActiveClubBanRecords(ctx, clubId, { cursor: null, numItems: 10 }),
      );

      expect(result.page).toHaveLength(1);
      expect(result.page[0].userId).toBe(bannedUser1._id);
      expect(result.page[0].isActive).toBe(true);
    });

    it("handles pagination correctly", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      for (let i = 0; i < 3; i++) {
        const bannedUser = await userHelpers.insertUser(`banned${i}@test.com`);
        await clubHelpers.insertClubBan(createTestClubBan(clubId, bannedUser._id, userId));
      }

      const firstPage = await t.runWithCtx((ctx) =>
        getActiveClubBanRecords(ctx, clubId, { cursor: null, numItems: 2 }),
      );
      const secondPage = await t.runWithCtx((ctx) =>
        getActiveClubBanRecords(ctx, clubId, { cursor: firstPage.continueCursor, numItems: 2 }),
      );

      expect(firstPage.page).toHaveLength(2);
      expect(secondPage.page).toHaveLength(1);
      expect(firstPage.isDone).toBe(false);
      expect(secondPage.isDone).toBe(true);
    });
  });

  describe("deleteAllClubMemberships", () => {
    it("deletes all memberships and resets member count", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1, { numMembers: 2 }));
      const clubId = club._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId1));
      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId2));

      await t.runWithCtx((ctx) => deleteAllClubMemberships(ctx, clubId));

      const memberships = await t.runWithCtx((ctx) => listAllClubMembers(ctx, clubId));
      const updatedClub = await clubHelpers.getClub(clubId);

      expect(memberships).toHaveLength(0);
      expect(updatedClub!.numMembers).toBe(0);
    });

    it("handles empty membership list", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      await t.runWithCtx((ctx) => deleteAllClubMemberships(ctx, clubId));

      const updatedClub = await clubHelpers.getClub(clubId);
      expect(updatedClub!.numMembers).toBe(0);
    });

    it("throws when club doesn't exist", async () => {
      await expect(
        t.runWithCtx((ctx) => deleteAllClubMemberships(ctx, "invalid-id" as Id<"clubs">)),
      ).rejects.toThrow();
    });
  });

  describe("listAllClubMembers", () => {
    it("returns all members for a club", async () => {
      const user1 = await userHelpers.insertUser();
      const userId1 = user1._id;
      const user2 = await userHelpers.insertUser("user2@test.com");
      const userId2 = user2._id;
      const club = await clubHelpers.insertClub(createTestClub(userId1));
      const clubId = club._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId1));
      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId2));

      const result = await t.runWithCtx((ctx) => listAllClubMembers(ctx, clubId));

      expect(result).toHaveLength(2);
      expect(result.every((member) => member.clubId === clubId)).toBe(true);
    });

    it("returns empty array when club has no members", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const clubId = club._id;

      const result = await t.runWithCtx((ctx) => listAllClubMembers(ctx, clubId));

      expect(result).toHaveLength(0);
    });

    it("throws when club doesn't exist", async () => {
      await expect(
        t.runWithCtx((ctx) => listAllClubMembers(ctx, "invalid-id" as Id<"clubs">)),
      ).rejects.toThrow();
    });
  });

  describe("listUserClubIds", () => {
    it("returns club IDs where user is a member", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club1 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId1 = club1._id;
      const club2 = await clubHelpers.insertClub(createTestClub(userId));
      const clubId2 = club2._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId1, userId));
      await clubHelpers.insertMembership(createTestClubMembership(clubId2, userId));

      const result = await t.runWithCtx((ctx) => listUserClubIds(ctx, userId));

      expect(result).toHaveLength(2);
      expect(result).toContain(clubId1);
      expect(result).toContain(clubId2);
    });

    it("returns empty array when user has no memberships", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;

      const result = await t.runWithCtx((ctx) => listUserClubIds(ctx, userId));

      expect(result).toHaveLength(0);
    });

    it("throws when user doesn't exist", async () => {
      await expect(
        t.runWithCtx((ctx) => listUserClubIds(ctx, "invalid-id" as Id<"users">)),
      ).rejects.toThrow();
    });
  });
});
