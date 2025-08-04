import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubInput,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("Club Functions", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
  });

  describe("listPublicClubs", () => {
    it("returns public approved clubs", async () => {
      const userId = await userHelpers.insertUser();
      const clubApproved = createTestClub(userId, { isPublic: true, isApproved: true });
      const club = createTestClub(userId, { isPublic: true, isApproved: false });
      await clubHelpers.insertClub(clubApproved);
      await clubHelpers.insertClub(club);

      const result = await t.query(api.service.clubs.functions.listPublicClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual(expect.objectContaining(clubApproved));
    });

    it("excludes private or unapproved clubs", async () => {
      const userId = await userHelpers.insertUser();
      await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));
      await clubHelpers.insertClub(createTestClub(userId, { isApproved: false }));

      const result = await t.query(api.service.clubs.functions.listPublicClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(0);
    });
  });

  describe("listMyClubs", () => {
    it("returns user's clubs with membership details", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      const profileId = await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, profileId, { name: "Test User" });
      await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.clubs.functions.listMyClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual(
        expect.objectContaining({
          ...club,
          membership: expect.objectContaining(membership),
        }),
      );
    });
  });

  describe("getClub", () => {
    it("returns club details", async () => {
      const userId = await userHelpers.insertUser();
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const result = await t.query(api.service.clubs.functions.getClub, { clubId });

      expect(result).toEqual(expect.objectContaining(club));
    });

    it("throws when club doesn't exist", async () => {
      const nonExistentId = "clubs_nonexistent" as Id<"clubs">;

      await expect(
        t.query(api.service.clubs.functions.getClub, { clubId: nonExistentId }),
      ).rejects.toThrow();
    });
  });

  describe("joinClub", () => {
    it("allows user to join club", async () => {
      const userId = await userHelpers.insertUser();
      const profileId = await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.approveClub(clubId);

      const membershipInfo = { name: "Test Member" };
      const asUser = t.withIdentity({ subject: userId });
      const membershipId = await asUser.mutation(api.service.clubs.functions.joinClub, {
        clubId,
        membershipInfo,
      });

      const membership = await clubHelpers.getMembership(membershipId);
      expect(membership).toEqual(
        expect.objectContaining({
          clubId,
          profileId: profileId,
          name: "Test Member",
          isApproved: false,
          isClubAdmin: false,
        }),
      );
    });

    it("throws when user already member", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      const profileId = await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.approveClub(clubId);

      const membership = createTestClubMembership(clubId, profileId, { name: "Existing Member" });
      await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test" },
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR);
    });

    it("throws when club is at max capacity", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId, { maxMembers: 1, numMembers: 1 });
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test" },
        }),
      ).rejects.toThrow(CLUB_FULL_ERROR);
    });

    it("throws when trying to join public unapproved club", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId, { isPublic: true, isApproved: false });
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test" },
        }),
      ).rejects.toThrow(CLUB_PUBLIC_UNAPPROVED_ERROR);
    });

    it("allows joining public approved club", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId, { isPublic: true, isApproved: true });
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test" },
        }),
      ).resolves.toBeDefined();
    });

    it("allows joining private unapproved club", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId, { isPublic: false, isApproved: false });
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test" },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("leaveClub", () => {
    it("allows user to leave club", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      const profileId = await userHelpers.insertProfile(profile);
      const club = createTestClub(userId, { numMembers: 1 });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, profileId, { name: "Test Member" });
      const membershipId = await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.leaveClub, { clubId });

      expect(await clubHelpers.getMembership(membershipId)).toBeNull();

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(0);
    });

    it("throws when user not a member", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.leaveClub, { clubId }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_REQUIRED_ERROR);
    });
  });

  describe("createClub", () => {
    it("creates club and adds creator as admin", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId, {
        gender: "M",
        preferredPlayStyle: "MD",
        skillLevel: "D",
      });
      const profileId = await userHelpers.insertProfile(profile);

      const input = {
        input: createTestClubInput(),
        membershipInfo: { name: "Creator" },
      };

      const asUser = t.withIdentity({ subject: userId });
      const clubId = await asUser.mutation(api.service.clubs.functions.createClub, input);

      const club = await clubHelpers.getClubRecord(clubId);
      expect(club).toEqual(
        expect.objectContaining({
          createdBy: userId,
          isApproved: false,
          numMembers: 1,
        }),
      );

      const membership = await clubHelpers.getMembershipForProfile(clubId, profileId);
      expect(membership).toEqual(
        expect.objectContaining({
          isApproved: true,
          isClubAdmin: true,
          name: input.membershipInfo.name,
          gender: profile.gender,
          preferredPlayStyle: profile.preferredPlayStyle,
          skillLevel: profile.skillLevel,
        }),
      );
    });

    it("creates club without membership info", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId, {
        gender: "M",
        preferredPlayStyle: "MD",
        skillLevel: "D",
      });
      const profileId = await userHelpers.insertProfile(profile);

      const input = createTestClubInput();
      const asUser = t.withIdentity({ subject: userId });
      const clubId = await asUser.mutation(api.service.clubs.functions.createClub, { input });

      const club = await clubHelpers.getClubRecord(clubId);
      expect(club).toEqual(
        expect.objectContaining({
          createdBy: userId,
          isApproved: false,
          numMembers: 1,
        }),
      );

      const membership = await clubHelpers.getMembershipForProfile(clubId, profileId);
      expect(membership).toEqual(
        expect.objectContaining({
          isApproved: true,
          isClubAdmin: true,
          name: `${profile.firstName} ${profile.lastName}`,
          gender: profile.gender,
          preferredPlayStyle: profile.preferredPlayStyle,
          skillLevel: profile.skillLevel,
        }),
      );
    });
  });

  describe("updateClub", () => {
    it("allows club owner to update", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const input = { name: "Updated Club Name" };
      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input });

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.name).toBe("Updated Club Name");
    });

    it("allows club admin to update", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("admin@example.com");
      const profile = createTestProfile(userId);
      const profileId = await userHelpers.insertProfile(profile);

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, profileId, {
        name: "Club Admin",
        isClubAdmin: true,
      });
      await clubHelpers.insertMembership(membership);

      const input = { name: "Admin Updated Name" };
      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input });

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.name).toBe("Admin Updated Name");
    });

    it("denies access to non-admin members", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");
      const profile = createTestProfile(userId);
      const profileId = await userHelpers.insertProfile(profile);

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, profileId, {
        name: "Regular Member",
      });
      await clubHelpers.insertMembership(membership);

      const input = { name: "Unauthorized Update" };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("deleteClub", () => {
    it("allows club owner to delete", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.deleteClub, { clubId, input: {} });

      const deletedClub = await clubHelpers.getClubRecord(clubId);
      expect(deletedClub).toBeNull();
    });

    it("denies access to non-owners", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("other@example.com");
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.deleteClub, { clubId, input: {} }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });
});
