import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  AUTH_ACCESS_DENIED_ERROR,
  CLUB_CANNOT_BAN_OWNER_ERROR,
  CLUB_CANNOT_BAN_SELF_ERROR,
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR,
  CLUB_MEMBERSHIP_NOT_FOUND_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_OWNER_CANNOT_LEAVE_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
  CLUB_PUBLIC_UNAPPROVED_ERROR,
  CLUB_USER_BANNED_ERROR,
  CLUB_USER_NOT_BANNED_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { ActivityTestHelpers, createTestActivity } from "@/test-utils/samples/activities";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubBan,
  createTestClubInput,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Activity } from "../../activities/schemas";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("Club Functions", () => {
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

  describe("listPublicClubs", () => {
    it("returns public approved clubs", async () => {
      const userId = await userHelpers.insertUser();
      const clubApproved = createTestClub(userId, { isPublic: true, isApproved: true });
      const club = createTestClub(userId, { isPublic: true, isApproved: false });
      await clubHelpers.insertClub(clubApproved);
      await clubHelpers.insertClub(club);

      const result = await t.query(api.service.clubs.functions.listPublicClubs, {
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toEqual(expect.objectContaining(clubApproved));
    });

    it("excludes private or unapproved clubs", async () => {
      const userId = await userHelpers.insertUser();
      await clubHelpers.insertClub(createTestClub(userId, { isPublic: false }));
      await clubHelpers.insertClub(createTestClub(userId, { isApproved: false }));

      const result = await t.query(api.service.clubs.functions.listPublicClubs, {
        pagination: { cursor: null, numItems: 10 },
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
        pagination: { cursor: null, numItems: 10 },
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
      const result = await asUser.mutation(api.service.clubs.functions.joinClub, {
        clubId,
        membershipInfo,
      });

      const membership = await clubHelpers.getMembershipForUser(clubId, userId);
      expect(membership).toBeDefined();
      expect(membership?.isApproved).toBe(false);
      expect(membership?.isClubAdmin).toBe(false);
      expect(result).toEqual(
        expect.objectContaining({
          name: "Test Member",
          isApproved: false,
          isClubAdmin: false,
        }),
      );

      // Validate join request activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const joinActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_JOIN_REQUEST);
      expect(joinActivity).toBeDefined();
      expect(joinActivity?.createdBy).toBe(userId);
      expect(joinActivity?.resourceId).toBe(clubId);
      expect(joinActivity?.relatedId).toEqual(userId);
    });

    it("banned user cannot join", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const bannedUser = await userHelpers.insertUser("banned@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(bannedUser));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });

      await clubHelpers.insertClubBan(createTestClubBan(clubId, bannedUser, owner));

      const asBannedUser = t.withIdentity({ subject: bannedUser });
      await expect(
        asBannedUser.mutation(api.service.clubs.functions.joinClub, {
          clubId,
        }),
      ).rejects.toThrow(CLUB_USER_BANNED_ERROR);
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

    it("handles member count correctly when club is at zero", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId, { numMembers: 0 });
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.approveClub(clubId);

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.joinClub, {
        clubId,
        membershipInfo: { name: "Test" },
      });

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(1);
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

      // Validate leave activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const leaveActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_LEFT);
      expect(leaveActivity).toBeDefined();
      expect(leaveActivity?.createdBy).toBe(userId);
      expect(leaveActivity?.resourceId).toBe(clubId);
      expect(leaveActivity?.relatedId).toEqual(userId);
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

    it("handles member count correctly when already at zero", async () => {
      const ownerUserId = await userHelpers.insertUser();
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(ownerUserId, { numMembers: 0 });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      await clubHelpers.insertMembership(membership);

      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.leaveClub, { clubId });

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(0);
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
      expect(membership).toBeDefined();
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

      // Validate activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      expect(activities).toHaveLength(2);
      expect(activities[1]).toEqual(
        expect.objectContaining({
          resourceId: clubId,
          type: ACTIVITY_TYPES.CLUB_CREATED,
          createdBy: userId,
        }),
      );
      expect(activities[0]).toEqual(
        expect.objectContaining({
          resourceId: clubId,
          type: ACTIVITY_TYPES.CLUB_JOINED,
          createdBy: userId,
          relatedId: userId,
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

      // Validate activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      expect(activities).toHaveLength(2);
      expect(activities[1]).toEqual(
        expect.objectContaining({
          resourceId: clubId,
          type: ACTIVITY_TYPES.CLUB_CREATED,
          createdBy: userId,
        }),
      );
      expect(activities[0]).toEqual(
        expect.objectContaining({
          resourceId: clubId,
          type: ACTIVITY_TYPES.CLUB_JOINED,
          createdBy: userId,
          relatedId: userId,
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
      const club = createTestClub(userId, { name: "Default club name" });
      const clubId = await clubHelpers.insertClub(club);

      const input = { name: "Updated Club Name" };
      const asUser = t.withIdentity({ subject: userId });
      await asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input });

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.name).toBe("Updated Club Name");

      // Validate update activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const updateActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_UPDATED);
      expect(updateActivity).toBeDefined();
      expect(updateActivity?.createdBy).toBe(userId);
      expect(updateActivity?.resourceId).toBe(clubId);
      expect(updateActivity?.metadata).toContainEqual({
        previousValue: "Default club name",
        newValue: "Updated Club Name",
        fieldChanged: "name",
      });
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

      const input = { isPublic: true };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).rejects.toThrow(CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR);
    });

    it("throws when non-admin tries to update isApproved", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const input = { isApproved: true };
      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });

    it("allows admin to update isApproved", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const adminId = await userHelpers.insertUser("admin@example.com");
      await userHelpers.insertProfile(createTestProfile(adminId, { isAdmin: true }));
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const input = { isApproved: true };
      const asAdmin = t.withIdentity({ subject: adminId });
      await expect(
        asAdmin.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
      ).resolves.toBeDefined();
    });

    it("denies access for non-system-admin to modify approval status", async () => {
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

      const input = { name: "Admin Updated Name", isApproved: true };
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

      // Validate activities were cleaned up
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      expect(activities).toHaveLength(1);
      expect(activities[0]).toEqual(
        expect.objectContaining({
          resourceId: clubId,
          type: ACTIVITY_TYPES.CLUB_DELETED,
          createdBy: userId,
        }),
      );
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

      // Validate membership update activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const updateActivity = activities.find(
        (a) => a.type === ACTIVITY_TYPES.CLUB_MEMBERSHIP_UPDATED,
      );
      expect(updateActivity).toBeDefined();
      expect(updateActivity?.createdBy).toBe(ownerId);
      expect(updateActivity?.resourceId).toBe(clubId);
      expect(updateActivity?.relatedId).toEqual(userId);
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

    it("handles empty membership input gracefully", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await expect(
        asOwner.mutation(api.service.clubs.functions.updateClubMembership, {
          membershipId,
          input: {},
        }),
      ).resolves.toBeDefined();
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

      // Validate membership removal activity was created
      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const removeActivity = activities.find(
        (a) => a.type === ACTIVITY_TYPES.CLUB_MEMBERSHIP_REMOVED,
      );
      expect(removeActivity).toBeDefined();
      expect(removeActivity?.createdBy).toBe(ownerId);
      expect(removeActivity?.resourceId).toBe(clubId);
      expect(removeActivity?.relatedId).toEqual(userId);
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

    it("handles member count correctly when already at zero", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("member@example.com");
      await userHelpers.insertProfile(createTestProfile(ownerId));

      const club = createTestClub(ownerId, { numMembers: 0 });
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      const membershipId = await clubHelpers.insertMembership(membership);

      const asOwner = t.withIdentity({ subject: ownerId });
      await asOwner.mutation(api.service.clubs.functions.removeClubMember, {
        membershipId,
      });

      const updatedClub = await clubHelpers.getClubRecord(clubId);
      expect(updatedClub?.numMembers).toBe(0);
    });
  });

  describe("listClubActivities", () => {
    it("returns activities when user is club member", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);

      const membership = createTestClubMembership(clubId, userId);
      await clubHelpers.insertMembership(membership);

      // Create test activities
      const activity1 = createTestActivity(clubId, userId, { type: ACTIVITY_TYPES.CLUB_CREATED });
      const activity2 = createTestActivity(clubId, userId, { type: ACTIVITY_TYPES.CLUB_UPDATED });
      await activityHelpers.insertActivity(activity1);
      await activityHelpers.insertActivity(activity2);

      const asUser = t.withIdentity({ subject: userId });
      const result = await asUser.query(api.service.clubs.functions.listClubActivities, {
        clubId,
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result).toBeDefined();
      expect(result.page).toBeDefined();
      expect(result.page).toHaveLength(2);
      expect(result.page.some((a: Activity) => a.type === ACTIVITY_TYPES.CLUB_CREATED)).toBe(true);
      expect(result.page.some((a: Activity) => a.type === ACTIVITY_TYPES.CLUB_UPDATED)).toBe(true);

      // Validate resourceId all activities
      result.page.forEach((activity: Activity) => {
        expect(activity.resourceId).toBe(clubId);
      });
    });

    it("throws error when club does not exist", async () => {
      const userId = await userHelpers.insertUser();
      await userHelpers.insertProfile(createTestProfile(userId));
      const club = createTestClub(userId);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.deleteClub(clubId);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.clubs.functions.listClubActivities, {
          clubId,
          pagination: { cursor: null, numItems: 10 },
        }),
      ).rejects.toThrow();
    });

    it("throws error when user is not club member", async () => {
      const ownerId = await userHelpers.insertUser("owner@example.com");
      const userId = await userHelpers.insertUser("user@example.com");
      await userHelpers.insertProfile(createTestProfile(userId));

      const club = createTestClub(ownerId);
      const clubId = await clubHelpers.insertClub(club);

      const asUser = t.withIdentity({ subject: userId });
      await expect(
        asUser.query(api.service.clubs.functions.listClubActivities, {
          clubId,
          pagination: { cursor: null, numItems: 10 },
        }),
      ).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
    });
  });

  describe("banClubMember", () => {
    it("successfully bans a member", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const member = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(member));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });
      const memberMembership = await clubHelpers.insertMembership({
        clubId,
        userId: member,
        name: "Member",
        isApproved: true,
        isClubAdmin: false,
        joinedAt: Date.now(),
      });

      const asOwner = t.withIdentity({ subject: owner });
      await asOwner.mutation(api.service.clubs.functions.banClubMember, {
        membershipId: memberMembership,
        reason: "Inappropriate behavior",
      });

      const removedMembership = await clubHelpers.getMembership(memberMembership);
      expect(removedMembership).toBeNull();

      const ban = await clubHelpers.getActiveBanForUser(clubId, member);
      expect(ban).toBeTruthy();
      expect(ban?.reason).toBe("Inappropriate behavior");
      expect(ban?.bannedBy).toBe(owner);
      expect(ban?.isActive).toBe(true);

      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const banActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_MEMBER_BANNED);
      expect(banActivity).toBeTruthy();
      expect(banActivity?.relatedId).toBe(member);
    });

    it("cannot ban club owner", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const admin = await userHelpers.insertUser("admin@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(admin));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      const ownerMembership = await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });
      await clubHelpers.insertMembership({
        clubId,
        userId: admin,
        name: "Admin",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });

      const asAdmin = t.withIdentity({ subject: admin });
      await expect(
        asAdmin.mutation(api.service.clubs.functions.banClubMember, {
          membershipId: ownerMembership,
          reason: "Test ban reason",
        }),
      ).rejects.toThrow(CLUB_CANNOT_BAN_OWNER_ERROR);
    });

    it("cannot ban self", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const member = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(member));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      const memberMembership = await clubHelpers.insertMembership({
        clubId,
        userId: member,
        name: "Member",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });

      const asMember = t.withIdentity({ subject: member });
      await expect(
        asMember.mutation(api.service.clubs.functions.banClubMember, {
          membershipId: memberMembership,
          reason: "Test ban reason",
        }),
      ).rejects.toThrow(CLUB_CANNOT_BAN_SELF_ERROR);
    });

    it("throws when membership not found", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      await userHelpers.insertProfile(createTestProfile(owner));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      const membershipId = await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });
      await clubHelpers.deleteClubMembership(membershipId);

      const asOwner = t.withIdentity({ subject: owner });
      await expect(
        asOwner.mutation(api.service.clubs.functions.banClubMember, {
          membershipId,
          reason: "Test ban reason",
        }),
      ).rejects.toThrow(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
    });
  });

  describe("unbanClubMember", () => {
    it("successfully unbans a member", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const member = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(member));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });

      const ban = await clubHelpers.insertClubBan(createTestClubBan(clubId, member, owner));

      const asOwner = t.withIdentity({ subject: owner });
      await asOwner.mutation(api.service.clubs.functions.unbanClubMember, {
        clubId,
        userId: member,
      });

      const updatedBan = await clubHelpers.getClubBan(ban);
      expect(updatedBan?.isActive).toBe(false);

      const activities = await activityHelpers.getActivitiesForResource(clubId);
      const unbanActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_MEMBER_UNBANNED);
      expect(unbanActivity).toBeTruthy();
      expect(unbanActivity?.relatedId).toBe(member);
    });

    it("fails when user is not banned", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const member = await userHelpers.insertUser("member@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(member));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });

      const asOwner = t.withIdentity({ subject: owner });
      await expect(
        asOwner.mutation(api.service.clubs.functions.unbanClubMember, {
          clubId,
          userId: member,
        }),
      ).rejects.toThrow(CLUB_USER_NOT_BANNED_ERROR);
    });
  });

  describe("listClubBans", () => {
    it("returns active bans for club", async () => {
      const owner = await userHelpers.insertUser("owner@example.com");
      const bannedUser1 = await userHelpers.insertUser("banned1@example.com");
      const bannedUser2 = await userHelpers.insertUser("banned2@example.com");

      await userHelpers.insertProfile(createTestProfile(owner));
      await userHelpers.insertProfile(createTestProfile(bannedUser1));
      await userHelpers.insertProfile(createTestProfile(bannedUser2));

      const club = createTestClub(owner);
      const clubId = await clubHelpers.insertClub(club);
      await clubHelpers.insertMembership({
        clubId,
        userId: owner,
        name: "Owner",
        isApproved: true,
        isClubAdmin: true,
        joinedAt: Date.now(),
      });

      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUser1, owner, { isActive: true }),
      );
      await clubHelpers.insertClubBan(
        createTestClubBan(clubId, bannedUser2, owner, { isActive: false }),
      );

      const asOwner = t.withIdentity({ subject: owner });
      const result = await asOwner.query(api.service.clubs.functions.listClubBans, {
        clubId,
        pagination: { cursor: null, numItems: 10 },
      });

      expect(result.page).toHaveLength(1);
      expect(result.page[0].userId).toBe(bannedUser1);
      expect(result.page[0].isActive).toBe(true);
    });
  });
});
