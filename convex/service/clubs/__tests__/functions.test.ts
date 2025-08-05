import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR,
  CLUB_MEMBERSHIP_NOT_FOUND_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_OWNER_CANNOT_LEAVE_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
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
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { name: "Test User" });
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
      await userHelpers.insertProfile(createTestProfile(userId));
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
          userId,
          name: "Test Member",
          isApproved: false,
          isClubAdmin: false,
        }),
      );
    });

    it("throws when user already member", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.approveClub(clubId);

      const membership = createTestClubMembership(clubId, userId, { name: "Existing Member" });
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
      const ownerUserId = await userHelpers.insertUser();
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(ownerUserId, { numMembers: 1 });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { name: "Test Member" });
      const membershipId = await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.leaveClub, { clubId });

      expect(await clubHelpers.getMembership(membershipId)).toBeNull();

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(0);
    });

    it("throws when user not a member", async () => {
      const ownerUserId = await userHelpers.insertUser();
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(ownerUserId);
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.leaveClub, { clubId }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_REQUIRED_ERROR);
    });

    it("throws when club owner tries to leave", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId, { numMembers: 1 });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { isClubAdmin: true });
      await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.leaveClub, { clubId }),
      ).rejects.toThrow(CLUB_OWNER_CANNOT_LEAVE_ERROR);
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
      await userHelpers.insertProfile(profile);

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

      const membership = await clubHelpers.getMembershipForUser(clubId, userId);
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
      await userHelpers.insertProfile(profile);

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

      const membership = await clubHelpers.getMembershipForUser(clubId, userId);
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

    it("throws when public club name already exists", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const existingClub = createTestClub(userId, { isPublic: true, name: "Duplicate Club" });
      await clubHelpers.insertClub(existingClub);

      const input = createTestClubInput({ isPublic: true, name: "Duplicate Club" });
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.createClub, { input }),
      ).rejects.toThrow(CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR);
    });

    it("allows duplicate names for private clubs", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const existingClub = createTestClub(userId, { isPublic: false, name: "Duplicate Club" });
      await clubHelpers.insertClub(existingClub);

      const input = createTestClubInput({ isPublic: false, name: "Duplicate Club" });
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.createClub, { input }),
      ).resolves.toBeDefined();
    });

    it("allows skill level min = max", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const input = createTestClubInput({ skillLevels: { min: 3, max: 3 } });
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.createClub, { input }),
      ).resolves.toBeDefined();
    });

    it("allows private club with same name as existing private club", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const existingClub = createTestClub(userId, { isPublic: false, name: "Private Club" });
      await clubHelpers.insertClub(existingClub);

      const input = createTestClubInput({ isPublic: false, name: "Private Club" });
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.createClub, { input }),
      ).resolves.toBeDefined();
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
      await userHelpers.insertProfile(profile);

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, {
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
      await userHelpers.insertProfile(profile);

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, {
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
      await asUser.mutation(api.service.clubs.functions.deleteClub, { clubId });

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
        asUser.mutation(api.service.clubs.functions.deleteClub, { clubId }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("updateClubMembership", () => {
    it("allows club owner to update membership", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");
      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { isApproved: false });
      const membershipId = await clubHelpers.insertMembership(membership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await asOwner.mutation(api.service.clubs.functions.updateClubMembership, {
        membershipId,
        input: { name: "updated", isApproved: true, isClubAdmin: true },
      });

      const updatedMembership = await clubHelpers.getMembership(membershipId);
      expect(updatedMembership).toEqual(
        expect.objectContaining({
          name: "updated",
          isApproved: true,
          isClubAdmin: true,
        }),
      );
    });

    it("allows system admin to update any membership", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const adminId = await userHelpers.insertUser("admin@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(adminId, { isAdmin: true }));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);

      const asAdmin = t.withIdentity({ subject: adminId });
      await expect(
        asAdmin.mutation(api.service.clubs.functions.updateClubMembership, {
          membershipId,
          input: { isApproved: true },
        }),
      ).resolves.toBeDefined();
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
        asMember.mutation(api.service.clubs.functions.updateClubMembership, {
          membershipId,
          input: { isApproved: true },
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("throws when membership not found", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);

      await clubHelpers.deleteClubMembership(membershipId);

      const asUser = t.withIdentity({ subject: userId });

      await expect(
        asUser.mutation(api.service.clubs.functions.updateClubMembership, {
          membershipId,
          input: { isApproved: true },
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
    });

    it("allows owner to update their own membership", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { isClubAdmin: true });
      const membershipId = await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.updateClubMembership, {
        membershipId,
        input: { name: "Updated Owner Name" },
      });

      const updatedMembership = await clubHelpers.getMembership(membershipId);
      expect(updatedMembership?.name).toBe("Updated Owner Name");
    });

    it("validates membership state transitions", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { isApproved: false });
      const membershipId = await clubHelpers.insertMembership(membership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await asOwner.mutation(api.service.clubs.functions.updateClubMembership, {
        membershipId,
        input: { isApproved: true, isClubAdmin: true },
      });

      const updatedMembership = await clubHelpers.getMembership(membershipId);
      expect(updatedMembership?.isApproved).toBe(true);
      expect(updatedMembership?.isClubAdmin).toBe(true);
    });
  });

  describe("removeClubMember", () => {
    it("allows club owner to remove member", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId, { numMembers: 2 });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await asOwner.mutation(api.service.clubs.functions.removeClubMember, {
        membershipId,
      });

      const deletedMembership = await clubHelpers.getMembership(membershipId);
      expect(deletedMembership).toBeNull();

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(1);
    });

    it("prevents removing club owner", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      await userHelpers.insertProfile(createTestProfile(ownerId, { isAdmin: true }));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const ownerMembership = createTestClubMembership(clubId, ownerId, { isClubAdmin: true });
      const membershipId = await clubHelpers.insertMembership(ownerMembership);

      const asAdmin = t.withIdentity({ subject: ownerId });
      await expect(
        asAdmin.mutation(api.service.clubs.functions.removeClubMember, {
          membershipId,
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
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
        asMember.mutation(api.service.clubs.functions.removeClubMember, {
          membershipId,
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("joinClub edge cases", () => {
    it("throws when club is at max capacity", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId, { maxMembers: 1, numMembers: 1 });
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test User" },
        }),
      ).rejects.toThrow(CLUB_FULL_ERROR);
    });

    it("throws when trying to join unapproved public club", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId, { isPublic: true, isApproved: false });
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test User" },
        }),
      ).rejects.toThrow(CLUB_PUBLIC_UNAPPROVED_ERROR);
    });

    it("throws when user already has membership", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId, { isApproved: true });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
          membershipInfo: { name: "Test User" },
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR);
    });
  });

  describe("leaveClub edge cases", () => {
    it("throws when owner tries to leave club", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId, { isClubAdmin: true });
      await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.leaveClub, { clubId }),
      ).rejects.toThrow(CLUB_OWNER_CANNOT_LEAVE_ERROR);
    });

    it("throws when non-member tries to leave", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("outsider@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.leaveClub, { clubId }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_REQUIRED_ERROR);
    });
  });

  describe("removeClubMember edge cases", () => {
    it("throws when trying to remove club owner", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const adminId = await userHelpers.insertUser("admin@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));
      await userHelpers.insertProfile(createTestProfile(adminId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const ownerMembership = createTestClubMembership(clubId, ownerId, { isClubAdmin: true });
      const adminMembership = createTestClubMembership(clubId, adminId, { isClubAdmin: true });

      const ownerMembershipId = await clubHelpers.insertMembership(ownerMembership);
      await clubHelpers.insertMembership(adminMembership);

      const asAdmin = t.withIdentity({ subject: adminId });
      await expect(
        asAdmin.mutation(api.service.clubs.functions.removeClubMember, {
          membershipId: ownerMembershipId,
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR);
    });

    it("throws when membership not found", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);
      await clubHelpers.deleteClubMembership(membershipId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.removeClubMember, {
          membershipId,
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
    });
  });

  describe("listPublicClubs", () => {
    it("returns only public and approved clubs", async () => {
      const userId = await userHelpers.insertUser();

      const publicApproved = createTestClub(userId, { isPublic: true, isApproved: true });
      const publicUnapproved = createTestClub(userId, { isPublic: true, isApproved: false });
      const privateApproved = createTestClub(userId, { isPublic: false, isApproved: true });

      await clubHelpers.insertClub(publicApproved);
      await clubHelpers.insertClub(publicUnapproved);
      await clubHelpers.insertClub(privateApproved);

      const result = await t.query(api.service.clubs.functions.listPublicClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].isPublic).toBe(true);
      expect(result.page[0].isApproved).toBe(true);
    });

    it("handles pagination correctly", async () => {
      const userId = await userHelpers.insertUser();

      for (let i = 0; i < 5; i++) {
        const club = createTestClub(userId, {
          isPublic: true,
          isApproved: true,
          name: `Club ${i}`,
        });
        await clubHelpers.insertClub(club);
      }

      const result = await t.query(api.service.clubs.functions.listPublicClubs, {
        cursor: null,
        numItems: 3,
      });

      expect(result.page).toHaveLength(3);
      expect(result.isDone).toBe(false);
    });
  });

  describe("listMyClubs", () => {
    it("returns clubs user is member of", async () => {
      const userId = await userHelpers.insertUser();
      const otherUserId = await userHelpers.insertUser("other@example.com");

      await userHelpers.insertProfile(createTestProfile(userId));

      const myClub = createTestClub(userId);
      const otherClub = createTestClub(otherUserId);

      const myClubId = await clubHelpers.insertClub(myClub);
      const otherClubId = await clubHelpers.insertClub(otherClub);

      const myMembership = createTestClubMembership(myClubId, userId);
      const otherMembership = createTestClubMembership(otherClubId, userId);

      await clubHelpers.insertMembership(myMembership);
      await clubHelpers.insertMembership(otherMembership);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.clubs.functions.listMyClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(2);
      expect(result.page.every((club) => club.membership)).toBe(true);
    });

    it("returns empty list for user with no memberships", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.clubs.functions.listMyClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(0);
    });

    it("filters out memberships for deleted clubs", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));

      const club1 = createTestClub(userId);
      const club2 = createTestClub(userId);

      const clubId1 = await clubHelpers.insertClub(club1);
      const clubId2 = await clubHelpers.insertClub(club2);

      const membership1 = createTestClubMembership(clubId1, userId);
      const membership2 = createTestClubMembership(clubId2, userId);

      await clubHelpers.insertMembership(membership1);
      await clubHelpers.insertMembership(membership2);

      // Delete one club but leave membership
      await clubHelpers.deleteClub(clubId1);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.clubs.functions.listMyClubs, {
        cursor: null,
        numItems: 10,
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]._id).toBe(clubId2);
    });
  });

  describe("updateClub", () => {
    it("throws when updating name to duplicate public club name", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);

      const existingClub = createTestClub(userId, { isPublic: true, name: "Existing Public Club" });
      await clubHelpers.insertClub(existingClub);

      const club = createTestClub(userId, { isPublic: true, name: "My Club" });
      const clubId = await clubHelpers.insertClub(club);

      const input = { name: "Existing Public Club" };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).rejects.toThrow(CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR);
    });

    it("allows updating name when changing from public to private", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);

      const existingClub = createTestClub(userId, { isPublic: true, name: "Duplicate Name" });
      await clubHelpers.insertClub(existingClub);

      const club = createTestClub(userId, { isPublic: true, name: "My Club" });
      const clubId = await clubHelpers.insertClub(club);

      const input = { name: "Duplicate Name", isPublic: false };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).resolves.toBeDefined();
    });

    it("allows updating skill levels with min = max", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const input = { skillLevels: { min: 3, max: 3 } };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).resolves.toBeDefined();
    });

    it("validates name correctly when only changing isPublic flag", async () => {
      const userId = await userHelpers.insertUser();
      const profile = createTestProfile(userId);
      await userHelpers.insertProfile(profile);

      const existingClub = createTestClub(userId, { isPublic: true, name: "Test Club" });
      await clubHelpers.insertClub(existingClub);

      const club = createTestClub(userId, { isPublic: false, name: "Test Club" });
      const clubId = await clubHelpers.insertClub(club);

      // Should fail when changing private club to public with existing name
      const input = { isPublic: true };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).rejects.toThrow(CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR);
    });
  });
});
