import { ACTIVITY_TYPES } from "@/convex/constants/activities";
import {
  CLUB_CANNOT_BAN_OWNER_ERROR,
  CLUB_CANNOT_BAN_SELF_ERROR,
  CLUB_MEMBERSHIP_NOT_FOUND_ERROR,
  CLUB_USER_BANNED_ERROR,
  CLUB_USER_NOT_BANNED_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import { ActivityTestHelpers } from "@/test-utils/samples/activities";
import { ClubTestHelpers, createTestClub, createTestClubBan } from "@/test-utils/samples/clubs";
import { UserTestHelpers, createTestProfile } from "@/test-utils/samples/users";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "../../../_generated/api";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

test("banClubMember - successfully bans a member", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);
  const activityHelpers = new ActivityTestHelpers(t);

  // Create users
  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");
  const admin = await userHelpers.insertUser("admin@example.com");

  // Create profiles
  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));
  await userHelpers.insertProfile(createTestProfile(admin));

  // Create club and memberships
  const club = await clubHelpers.insertClub(createTestClub(owner));
  await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });
  const memberMembership = await clubHelpers.insertMembership({
    clubId: club,
    userId: member,
    name: "Member",
    isApproved: true,
    isClubAdmin: false,
    joinedAt: Date.now(),
  });

  // Ban the member as owner
  const asOwner = t.withIdentity({ subject: owner });
  await asOwner.mutation(api.service.clubs.functions.banClubMember, {
    membershipId: memberMembership,
    reason: "Inappropriate behavior",
  });

  // Verify membership was removed
  const removedMembership = await clubHelpers.getMembership(memberMembership);
  expect(removedMembership).toBeNull();

  // Verify ban was created
  const ban = await clubHelpers.getActiveBanForUser(club, member);
  expect(ban).toBeTruthy();
  expect(ban?.reason).toBe("Inappropriate behavior");
  expect(ban?.bannedBy).toBe(owner);
  expect(ban?.isActive).toBe(true);

  // Verify activity was logged
  const activities = await activityHelpers.getActivitiesForResource(club);
  const banActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_MEMBER_BANNED);
  expect(banActivity).toBeTruthy();
  expect(banActivity?.relatedId).toBe(member);
});

test("banClubMember - cannot ban club owner", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const admin = await userHelpers.insertUser("admin@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(admin));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  const ownerMembership = await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });

  // Make admin a club admin so they have permission to ban
  await clubHelpers.insertMembership({
    clubId: club,
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
      reason: "Test",
    }),
  ).rejects.toThrow(CLUB_CANNOT_BAN_OWNER_ERROR);
});

test("banClubMember - cannot ban self", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  const memberMembership = await clubHelpers.insertMembership({
    clubId: club,
    userId: member,
    name: "Member",
    isApproved: true,
    isClubAdmin: true, // Make member an admin so they have permission to try banning
    joinedAt: Date.now(),
  });

  const asMember = t.withIdentity({ subject: member });
  await expect(
    asMember.mutation(api.service.clubs.functions.banClubMember, {
      membershipId: memberMembership,
      reason: "Test",
    }),
  ).rejects.toThrow(CLUB_CANNOT_BAN_SELF_ERROR);
});

test("banClubMember - handles empty ban reason", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  const memberMembership = await clubHelpers.insertMembership({
    clubId: club,
    userId: member,
    name: "Member",
    isApproved: true,
    isClubAdmin: false,
    joinedAt: Date.now(),
  });

  const asOwner = t.withIdentity({ subject: owner });
  await asOwner.mutation(api.service.clubs.functions.banClubMember, {
    membershipId: memberMembership,
  });

  const ban = await clubHelpers.getActiveBanForUser(club, member);
  expect(ban).toBeTruthy();
  expect(ban?.reason).toBeUndefined();
});

test("banClubMember - updates member count when already at zero", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner, { numMembers: 0 }));
  const memberMembership = await clubHelpers.insertMembership({
    clubId: club,
    userId: member,
    name: "Member",
    isApproved: true,
    isClubAdmin: false,
    joinedAt: Date.now(),
  });

  const asOwner = t.withIdentity({ subject: owner });
  await asOwner.mutation(api.service.clubs.functions.banClubMember, {
    membershipId: memberMembership,
    reason: "Test ban",
  });

  const updatedClub = await clubHelpers.getClubRecord(club);
  expect(updatedClub?.numMembers).toBe(0);
});

test("banClubMember - throws when membership not found", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  await userHelpers.insertProfile(createTestProfile(owner));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  const membershipId = await clubHelpers.insertMembership({
    clubId: club,
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
      reason: "Test",
    }),
  ).rejects.toThrow(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
});

test("banClubMember - decrements member count when greater than zero", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner, { numMembers: 2 }));
  const memberMembership = await clubHelpers.insertMembership({
    clubId: club,
    userId: member,
    name: "Member",
    isApproved: true,
    isClubAdmin: false,
    joinedAt: Date.now(),
  });

  const asOwner = t.withIdentity({ subject: owner });
  await asOwner.mutation(api.service.clubs.functions.banClubMember, {
    membershipId: memberMembership,
    reason: "Test ban",
  });

  const updatedClub = await clubHelpers.getClubRecord(club);
  expect(updatedClub?.numMembers).toBe(1);
});

test("unbanClubMember - successfully unbans a member", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);
  const activityHelpers = new ActivityTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });

  // Create active ban
  const ban = await clubHelpers.insertClubBan(createTestClubBan(club, member, owner));

  // Unban the member
  const asOwner = t.withIdentity({ subject: owner });
  await asOwner.mutation(api.service.clubs.functions.unbanClubMember, {
    clubId: club,
    userId: member,
  });

  // Verify ban was deactivated
  const updatedBan = await clubHelpers.getClubBan(ban);
  expect(updatedBan?.isActive).toBe(false);

  // Verify activity was logged
  const activities = await activityHelpers.getActivitiesForResource(club);
  const unbanActivity = activities.find((a) => a.type === ACTIVITY_TYPES.CLUB_MEMBER_UNBANNED);
  expect(unbanActivity).toBeTruthy();
  expect(unbanActivity?.relatedId).toBe(member);
});

test("unbanClubMember - fails when user is not banned", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });

  const asOwner = t.withIdentity({ subject: owner });
  await expect(
    asOwner.mutation(api.service.clubs.functions.unbanClubMember, {
      clubId: club,
      userId: member,
    }),
  ).rejects.toThrow(CLUB_USER_NOT_BANNED_ERROR);
});

test("unbanClubMember - fails when ban is already inactive", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const member = await userHelpers.insertUser("member@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(member));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });

  // Create inactive ban
  await clubHelpers.insertClubBan(createTestClubBan(club, member, owner, { isActive: false }));

  const asOwner = t.withIdentity({ subject: owner });
  await expect(
    asOwner.mutation(api.service.clubs.functions.unbanClubMember, {
      clubId: club,
      userId: member,
    }),
  ).rejects.toThrow(CLUB_USER_NOT_BANNED_ERROR);
});

test("joinClub - banned user cannot join", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const bannedUser = await userHelpers.insertUser("banned@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(bannedUser));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });

  // Create active ban
  await clubHelpers.insertClubBan(createTestClubBan(club, bannedUser, owner));

  // Try to join club as banned user
  const asBannedUser = t.withIdentity({ subject: bannedUser });
  await expect(
    asBannedUser.mutation(api.service.clubs.functions.joinClub, {
      clubId: club,
    }),
  ).rejects.toThrow(CLUB_USER_BANNED_ERROR);
});

test("listClubBans - returns active bans for club", async () => {
  const t = convexTest(schema);
  const clubHelpers = new ClubTestHelpers(t);
  const userHelpers = new UserTestHelpers(t);

  const owner = await userHelpers.insertUser("owner@example.com");
  const bannedUser1 = await userHelpers.insertUser("banned1@example.com");
  const bannedUser2 = await userHelpers.insertUser("banned2@example.com");

  await userHelpers.insertProfile(createTestProfile(owner));
  await userHelpers.insertProfile(createTestProfile(bannedUser1));
  await userHelpers.insertProfile(createTestProfile(bannedUser2));

  const club = await clubHelpers.insertClub(createTestClub(owner));
  await clubHelpers.insertMembership({
    clubId: club,
    userId: owner,
    name: "Owner",
    isApproved: true,
    isClubAdmin: true,
    joinedAt: Date.now(),
  });

  // Create active and inactive bans
  await clubHelpers.insertClubBan(createTestClubBan(club, bannedUser1, owner, { isActive: true }));
  await clubHelpers.insertClubBan(createTestClubBan(club, bannedUser2, owner, { isActive: false }));

  const asOwner = t.withIdentity({ subject: owner });
  const result = await asOwner.query(api.service.clubs.functions.listClubBans, {
    clubId: club,
    pagination: { cursor: null, numItems: 10 },
  });

  expect(result.page).toHaveLength(1);
  expect(result.page[0].userId).toBe(bannedUser1);
  expect(result.page[0].isActive).toBe(true);
});
