import { api } from "@/convex/_generated/api";
import { AUTH_ACCESS_DENIED_ERROR } from "@/convex/constants/errors";
import schema from "@/convex/schema";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("Bulk Club Operations", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
  });

  describe("approveClubMemberships", () => {
    it("returns 0 for empty membership array", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [],
      });

      expect(result).toBe(0);
    });

    it("handles non-existent membership IDs gracefully", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);
      await clubHelpers.deleteClubMembership(membershipId);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [membershipId],
      });

      expect(result).toBe(0);
    });

    it("skips already approved memberships", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { isApproved: true });
      const membershipId = await clubHelpers.insertMembership(membership);

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [membershipId],
      });

      expect(result).toBe(0);
    });
    it("approves multiple pending memberships", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const user1Id = await userHelpers.insertUser("user1@example.com");
      const user2Id = await userHelpers.insertUser("user2@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership1 = createTestClubMembership(clubId, user1Id, { isApproved: false });
      const membership2 = createTestClubMembership(clubId, user2Id, { isApproved: false });

      const membershipId1 = await clubHelpers.insertMembership(membership1);
      const membershipId2 = await clubHelpers.insertMembership(membership2);

      const asOwner = t.withIdentity({ subject: ownerId });
      const approvedCount = await asOwner.mutation(
        api.service.clubs.functions.approveClubMemberships,
        {
          membershipIds: [membershipId1, membershipId2],
        },
      );

      expect(approvedCount).toBe(2);

      const updatedMembership1 = await clubHelpers.getMembership(membershipId1);
      const updatedMembership2 = await clubHelpers.getMembership(membershipId2);

      expect(updatedMembership1?.isApproved).toBe(true);
      expect(updatedMembership2?.isApproved).toBe(true);
    });

    it("throws when memberships belong to different clubs", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club1 = createTestClub(ownerId);
      const club2 = createTestClub(ownerId);
      const clubId1 = await clubHelpers.insertClub(club1);
      const clubId2 = await clubHelpers.insertClub(club2);

      const membership1 = createTestClubMembership(clubId1, userId);
      const membership2 = createTestClubMembership(clubId2, userId);

      const membershipId1 = await clubHelpers.insertMembership(membership1);
      const membershipId2 = await clubHelpers.insertMembership(membership2);

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.approveClubMemberships, {
          membershipIds: [membershipId1, membershipId2],
        }),
      ).rejects.toThrow("All memberships must belong to the same club");
    });

    it("denies access to regular members", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);

      const asMember = t.withIdentity({ subject: userId });
      await expect(
        asMember.mutation(api.service.clubs.functions.approveClubMemberships, {
          membershipIds: [membershipId],
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("bulkRemoveMembers", () => {
    it("returns 0 for empty membership array", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.clubs.functions.bulkRemoveMembers, {
        membershipIds: [],
      });

      expect(result).toBe(0);
    });

    it("handles non-existent membership IDs gracefully", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);
      await clubHelpers.deleteClubMembership(membershipId);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.clubs.functions.bulkRemoveMembers, {
        membershipIds: [membershipId],
      });

      expect(result).toBe(0);
    });

    it("removes multiple members", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const user1Id = await userHelpers.insertUser("user1@example.com");
      const user2Id = await userHelpers.insertUser("user2@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId, { numMembers: 3 });
      const clubId = await clubHelpers.insertClub(club);

      const membership1 = createTestClubMembership(clubId, user1Id);
      const membership2 = createTestClubMembership(clubId, user2Id);

      const membershipId1 = await clubHelpers.insertMembership(membership1);
      const membershipId2 = await clubHelpers.insertMembership(membership2);

      const asOwner = t.withIdentity({ subject: ownerId });
      const removedCount = await asOwner.mutation(api.service.clubs.functions.bulkRemoveMembers, {
        membershipIds: [membershipId1, membershipId2],
      });

      expect(removedCount).toBe(2);

      const deletedMembership1 = await clubHelpers.getMembership(membershipId1);
      const deletedMembership2 = await clubHelpers.getMembership(membershipId2);

      expect(deletedMembership1).toBeNull();
      expect(deletedMembership2).toBeNull();

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(1);
    });

    it("throws when memberships belong to different clubs", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club1 = createTestClub(ownerId);
      const club2 = createTestClub(ownerId);
      const clubId1 = await clubHelpers.insertClub(club1);
      const clubId2 = await clubHelpers.insertClub(club2);

      const membership1 = createTestClubMembership(clubId1, userId);
      const membership2 = createTestClubMembership(clubId2, userId);

      const membershipId1 = await clubHelpers.insertMembership(membership1);
      const membershipId2 = await clubHelpers.insertMembership(membership2);

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.bulkRemoveMembers, {
          membershipIds: [membershipId1, membershipId2],
        }),
      ).rejects.toThrow("All memberships must belong to the same club");
    });

    it("updates member count correctly after bulk removal", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const user1Id = await userHelpers.insertUser("user1@example.com");
      const user2Id = await userHelpers.insertUser("user2@example.com");
      const user3Id = await userHelpers.insertUser("user3@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId, { numMembers: 4 });
      const clubId = await clubHelpers.insertClub(club);

      const membership1 = createTestClubMembership(clubId, user1Id);
      const membership2 = createTestClubMembership(clubId, user2Id);
      const membership3 = createTestClubMembership(clubId, user3Id);

      const membershipId1 = await clubHelpers.insertMembership(membership1);
      const membershipId2 = await clubHelpers.insertMembership(membership2);
      const membershipId3 = await clubHelpers.insertMembership(membership3);

      const asOwner = t.withIdentity({ subject: ownerId });
      const removedCount = await asOwner.mutation(api.service.clubs.functions.bulkRemoveMembers, {
        membershipIds: [membershipId1, membershipId2, membershipId3],
      });

      expect(removedCount).toBe(3);

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(1);
    });

    it("throws when trying to remove club owner", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId, { numMembers: 2 });
      const clubId = await clubHelpers.insertClub(club);

      const ownerMembership = createTestClubMembership(clubId, ownerId, { isClubAdmin: true });
      const userMembership = createTestClubMembership(clubId, userId);

      const ownerMembershipId = await clubHelpers.insertMembership(ownerMembership);
      const userMembershipId = await clubHelpers.insertMembership(userMembership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.bulkRemoveMembers, {
          membershipIds: [ownerMembershipId, userMembershipId],
        }),
      ).rejects.toThrow("You cannot remove the club owner");
    });

    it("throws when trying to remove only club owner", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId, { numMembers: 1 });
      const clubId = await clubHelpers.insertClub(club);

      const ownerMembership = createTestClubMembership(clubId, ownerId, { isClubAdmin: true });
      const ownerMembershipId = await clubHelpers.insertMembership(ownerMembership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.bulkRemoveMembers, {
          membershipIds: [ownerMembershipId],
        }),
      ).rejects.toThrow("You cannot remove the club owner");
    });
  });

  describe("Data Integrity", () => {
    it("maintains accurate member count after join and leave operations", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const user1Id = await userHelpers.insertUser("user1@example.com");
      const user2Id = await userHelpers.insertUser("user2@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(user1Id));
      await userHelpers.insertProfile(createTestProfile(user2Id));

      const club = createTestClub(ownerId, { numMembers: 1, isApproved: true });
      const clubId = await clubHelpers.insertClub(club);

      // Add owner membership
      const ownerMembership = createTestClubMembership(clubId, ownerId, { isClubAdmin: true });
      await clubHelpers.insertMembership(ownerMembership);

      // User 1 joins
      const asUser1 = t.withIdentity({ subject: user1Id });
      await asUser1.mutation(api.service.clubs.functions.joinClub, {
        clubId,
        membershipInfo: { name: "User 1" },
      });

      let updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(2);

      // User 2 joins
      const asUser2 = t.withIdentity({ subject: user2Id });
      await asUser2.mutation(api.service.clubs.functions.joinClub, {
        clubId,
        membershipInfo: { name: "User 2" },
      });

      updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(3);

      // User 1 leaves
      await asUser1.mutation(api.service.clubs.functions.leaveClub, { clubId });

      updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(2);
    });

    it("handles mixed valid and invalid membership IDs", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const user1Id = await userHelpers.insertUser("user1@example.com");
      const user2Id = await userHelpers.insertUser("user2@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership1 = createTestClubMembership(clubId, user1Id, { isApproved: false });
      const membership2 = createTestClubMembership(clubId, user2Id, { isApproved: false });

      const membershipId1 = await clubHelpers.insertMembership(membership1);
      const membershipId2 = await clubHelpers.insertMembership(membership2);

      // Delete one membership to make it invalid
      await clubHelpers.deleteClubMembership(membershipId2);

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [membershipId1, membershipId2],
      });

      expect(result).toBe(1);

      const updatedMembership1 = await clubHelpers.getMembership(membershipId1);
      expect(updatedMembership1?.isApproved).toBe(true);
    });
  });
});
