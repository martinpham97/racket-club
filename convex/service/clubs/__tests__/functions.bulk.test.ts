import { api } from "@/convex/_generated/api";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { Activity } from "@/convex/service/activities/schemas";
import { convexTest } from "@/convex/setup.testing";
import { ActivityTestHelpers } from "@/test-utils/samples/activities";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("Bulk Club Operations", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let activityHelpers: ActivityTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    activityHelpers = new ActivityTestHelpers(t);
  });

  describe("approveClubMemberships", () => {
    it("returns 0 for empty membership array", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [],
      });

      expect(result).toBe(0);
    });

    it("handles non-existent membership IDs gracefully", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId);
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;
      await clubHelpers.deleteClubMembership(membershipId);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [membershipId],
      });

      expect(result).toBe(0);
    });

    it("skips already approved memberships", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId, { isApproved: true });
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [membershipId],
      });

      expect(result).toBe(0);
    });

    it("approves multiple pending memberships", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user1 = await userHelpers.insertUser("user1@example.com");
      const user2 = await userHelpers.insertUser("user2@example.com");
      const ownerId = owner._id;
      const user1Id = user1._id;
      const user2Id = user2._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership1 = createTestClubMembership(clubId, user1Id, { isApproved: false });
      const membership2 = createTestClubMembership(clubId, user2Id, { isApproved: false });

      const membershipRecord1 = await clubHelpers.insertMembership(membership1);
      const membershipRecord2 = await clubHelpers.insertMembership(membership2);
      const membershipId1 = membershipRecord1._id;
      const membershipId2 = membershipRecord2._id;

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

      // Validate join activities were created
      const activities = await activityHelpers.getActivitiesForClub(clubId);
      const joinActivities = activities.filter(
        (a: Activity) => a.type === ACTIVITY_TYPES.CLUB_JOINED,
      );
      expect(joinActivities).toHaveLength(2);
      joinActivities.forEach((activity: Activity) => {
        expect(activity.clubId).toBe(clubId);
        expect([user1Id, user2Id]).toContain(activity.userId);
      });
    });

    it("throws when memberships belong to different clubs", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club1 = createTestClub(ownerId);
      const club2 = createTestClub(ownerId);
      const clubRecord1 = await clubHelpers.insertClub(club1);
      const clubRecord2 = await clubHelpers.insertClub(club2);
      const clubId1 = clubRecord1._id;
      const clubId2 = clubRecord2._id;

      const membership1 = createTestClubMembership(clubId1, userId);
      const membership2 = createTestClubMembership(clubId2, userId);

      const membershipRecord1 = await clubHelpers.insertMembership(membership1);
      const membershipRecord2 = await clubHelpers.insertMembership(membership2);
      const membershipId1 = membershipRecord1._id;
      const membershipId2 = membershipRecord2._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.approveClubMemberships, {
          membershipIds: [membershipId1, membershipId2],
        }),
      ).rejects.toThrow("All memberships must belong to the same club");
    });

    it("denies access to regular members", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId);
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;

      const asMember = t.withIdentity({ subject: userId });
      await expect(
        asMember.mutation(api.service.clubs.functions.approveClubMemberships, {
          membershipIds: [membershipId],
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("handles duplicate membership IDs", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId, { isApproved: false });
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.approveClubMemberships, {
        membershipIds: [membershipId, membershipId, membershipId],
      });

      expect(result).toBe(1);
      const updatedMembership = await clubHelpers.getMembership(membershipId);
      expect(updatedMembership?.isApproved).toBe(true);
    });
  });

  describe("removeMembers", () => {
    it("returns 0 for empty membership array", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.removeMembers, {
        membershipIds: [],
      });

      expect(result).toBe(0);
    });

    it("handles non-existent membership IDs gracefully", async () => {
      const owner = await userHelpers.insertUser();
      const user = await userHelpers.insertUser();
      const ownerId = owner._id;
      const userId = user._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId);
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;
      await clubHelpers.deleteClubMembership(membershipId);

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.removeMembers, {
        membershipIds: [membershipId],
      });

      expect(result).toBe(0);
    });

    it("removes multiple members", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user1 = await userHelpers.insertUser("user1@example.com");
      const user2 = await userHelpers.insertUser("user2@example.com");
      const ownerId = owner._id;
      const user1Id = user1._id;
      const user2Id = user2._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership1 = createTestClubMembership(clubId, user1Id);
      const membership2 = createTestClubMembership(clubId, user2Id);

      const membershipRecord1 = await clubHelpers.insertMembership(membership1);
      const membershipRecord2 = await clubHelpers.insertMembership(membership2);
      const membershipId1 = membershipRecord1._id;
      const membershipId2 = membershipRecord2._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      const removedCount = await asOwner.mutation(api.service.clubs.functions.removeMembers, {
        membershipIds: [membershipId1, membershipId2],
      });

      expect(removedCount).toBe(2);

      // Verify memberships are deleted
      const membership1After = await clubHelpers.getMembership(membershipId1);
      const membership2After = await clubHelpers.getMembership(membershipId2);
      expect(membership1After).toBeNull();
      expect(membership2After).toBeNull();

      // Validate removal activities were created
      const activities = await activityHelpers.getActivitiesForClub(clubId);
      const removalActivities = activities.filter(
        (a: Activity) => a.type === ACTIVITY_TYPES.CLUB_MEMBERSHIP_REMOVED,
      );
      expect(removalActivities).toHaveLength(2);
      removalActivities.forEach((activity: Activity) => {
        expect(activity.clubId).toBe(clubId);
        expect([user1Id, user2Id]).toContain(activity.userId);
      });
    });

    it("throws when trying to remove club owner", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const ownerId = owner._id;
      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const ownerMembership = createTestClubMembership(clubId, ownerId, { isClubAdmin: true });
      const membershipRecord = await clubHelpers.insertMembership(ownerMembership);
      const membershipId = membershipRecord._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.removeMembers, {
          membershipIds: [membershipId],
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    });

    it("denies access to regular members", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId);
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;

      const asMember = t.withIdentity({ subject: userId });
      await expect(
        asMember.mutation(api.service.clubs.functions.removeMembers, {
          membershipIds: [membershipId],
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("handles duplicate membership IDs", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubRecord = await clubHelpers.insertClub(club);
      const clubId = clubRecord._id;

      const membership = createTestClubMembership(clubId, userId);
      const membershipRecord = await clubHelpers.insertMembership(membership);
      const membershipId = membershipRecord._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      const result = await asOwner.mutation(api.service.clubs.functions.removeMembers, {
        membershipIds: [membershipId, membershipId, membershipId],
      });

      expect(result).toBe(1);
      const membershipAfter = await clubHelpers.getMembership(membershipId);
      expect(membershipAfter).toBeNull();
    });

    it("throws when memberships belong to different clubs", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const user = await userHelpers.insertUser("member@example.com");
      const ownerId = owner._id;
      const userId = user._id;

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club1 = createTestClub(ownerId);
      const club2 = createTestClub(ownerId);
      const clubRecord1 = await clubHelpers.insertClub(club1);
      const clubRecord2 = await clubHelpers.insertClub(club2);
      const clubId1 = clubRecord1._id;
      const clubId2 = clubRecord2._id;

      const membership1 = createTestClubMembership(clubId1, userId);
      const membership2 = createTestClubMembership(clubId2, userId);

      const membershipRecord1 = await clubHelpers.insertMembership(membership1);
      const membershipRecord2 = await clubHelpers.insertMembership(membership2);
      const membershipId1 = membershipRecord1._id;
      const membershipId2 = membershipRecord2._id;

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.removeMembers, {
          membershipIds: [membershipId1, membershipId2],
        }),
      ).rejects.toThrow("All memberships must belong to the same club");
    });
  });
});
