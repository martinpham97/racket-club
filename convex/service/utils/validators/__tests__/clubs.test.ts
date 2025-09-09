import {
  CLUB_FULL_ERROR,
  CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
  CLUB_MEMBERSHIP_REQUIRED_ERROR,
  CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR,
  CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
  CLUB_USER_BANNED_ERROR,
} from "@/convex/constants/errors";
import schema from "@/convex/schema";
import {
  isClubOwner,
  validateBulkMemberships,
  validateClubJoinability,
  validateClubMembershipExists,
  validateClubName,
  validateMembershipDoesNotExist,
  validateMembershipExists,
  validateUserNotBanned,
} from "@/convex/service/utils/validators/clubs";
import { convexTest } from "@/convex/setup.testing";
import {
  ClubTestHelpers,
  createTestClub,
  createTestClubMembership,
} from "@/test-utils/samples/clubs";
import { UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

describe("Club Validators", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
  });

  describe("validateClubName", () => {
    it("allows unique public club name", async () => {
      await t.runWithCtx(async (ctx) => {
        await expect(validateClubName(ctx, "Unique Club", true)).resolves.toBeUndefined();
      });
    });

    it("throws when public club name exists", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      await clubHelpers.insertClub(
        createTestClub(ownerId, { name: "Existing Club", isPublic: true }),
      );

      await t.runWithCtx(async (ctx) => {
        await expect(validateClubName(ctx, "Existing Club", true)).rejects.toThrow(
          CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR,
        );
      });
    });

    it("allows duplicate names for private clubs", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      await clubHelpers.insertClub(
        createTestClub(ownerId, { name: "Private Club", isPublic: false }),
      );

      await t.runWithCtx(async (ctx) => {
        await expect(validateClubName(ctx, "Private Club", false)).resolves.toBeUndefined();
      });
    });
  });

  describe("validateClubMembershipExists", () => {
    it("returns membership when exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      const membershipRecord = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId),
      );

      await t.runWithCtx(async (ctx) => {
        const result = await validateClubMembershipExists(ctx, clubId, userId);
        expect(result).toBeDefined();
        expect(result._id).toBe(membershipRecord._id);
      });
    });

    it("throws when membership does not exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      await t.runWithCtx(async (ctx) => {
        await expect(validateClubMembershipExists(ctx, clubId, userId)).rejects.toThrow();
      });
    });
  });

  describe("validateClubJoinability", () => {
    it("allows joining when club has capacity", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(
        createTestClub(ownerId, {
          numMembers: 5,
          maxMembers: 10,
          isPublic: true,
          isApproved: true,
        }),
      );

      expect(() => validateClubJoinability(clubRecord)).not.toThrow();
    });

    it("throws when club is full", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(
        createTestClub(ownerId, {
          numMembers: 10,
          maxMembers: 10,
          isPublic: false,
        }),
      );

      expect(() => validateClubJoinability(clubRecord)).toThrow(CLUB_FULL_ERROR);
    });

    it("throws when public club is unapproved", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(
        createTestClub(ownerId, {
          isPublic: true,
          isApproved: false,
        }),
      );

      expect(() => validateClubJoinability(clubRecord)).toThrow();
    });
  });

  describe("validateBulkMemberships", () => {
    it("returns empty for empty array", async () => {
      await t.runWithCtx(async (ctx) => {
        const result = await validateBulkMemberships(ctx, []);
        expect(result).toEqual({ memberships: [], clubId: null });
      });
    });

    it("returns empty when no memberships found", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      const membershipRecord = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId),
      );
      const membershipId = membershipRecord._id;
      await clubHelpers.deleteClubMembership(membershipId);

      await t.runWithCtx(async (ctx) => {
        const result = await validateBulkMemberships(ctx, [membershipId]);
        expect(result).toEqual({ memberships: [], clubId: null });
      });
    });

    it("returns memberships from same club", async () => {
      const user1 = await userHelpers.insertUser();
      const user2 = await userHelpers.insertUser();
      const user1Id = user1._id;
      const user2Id = user2._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      const membershipRecord1 = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, user1Id),
      );
      const membershipRecord2 = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, user2Id),
      );

      await t.runWithCtx(async (ctx) => {
        const result = await validateBulkMemberships(ctx, [
          membershipRecord1._id,
          membershipRecord2._id,
        ]);
        expect(result.memberships).toHaveLength(2);
        expect(result.clubId).toBe(clubId);
      });
    });

    it("throws when memberships from different clubs", async () => {
      const user1 = await userHelpers.insertUser();
      const user2 = await userHelpers.insertUser();
      const user1Id = user1._id;
      const user2Id = user2._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;

      const clubRecord1 = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubRecord2 = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId1 = clubRecord1._id;
      const clubId2 = clubRecord2._id;

      const membershipRecord1 = await clubHelpers.insertMembership(
        createTestClubMembership(clubId1, user1Id),
      );
      const membershipRecord2 = await clubHelpers.insertMembership(
        createTestClubMembership(clubId2, user2Id),
      );

      await t.runWithCtx(async (ctx) => {
        await expect(
          validateBulkMemberships(ctx, [membershipRecord1._id, membershipRecord2._id]),
        ).rejects.toThrow(CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR);
      });
    });

    it("handles duplicate IDs", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      const membershipRecord = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId),
      );

      await t.runWithCtx(async (ctx) => {
        const result = await validateBulkMemberships(ctx, [
          membershipRecord._id,
          membershipRecord._id,
        ]);
        expect(result.memberships).toHaveLength(1);
        expect(result.clubId).toBe(clubId);
      });
    });
  });

  describe("validateUserNotBanned", () => {
    it("passes when user not banned", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      await t.runWithCtx(async (ctx) => {
        await expect(validateUserNotBanned(ctx, clubId, userId)).resolves.toBeUndefined();
      });
    });

    it("throws when user is banned", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      await t.runWithCtx(async (ctx) => {
        await ctx.table("clubBans").insert({
          clubId,
          userId,
          bannedBy: ownerId,
          bannedAt: Date.now(),
          reason: "Test ban",
          isActive: true,
        });

        await expect(validateUserNotBanned(ctx, clubId, userId)).rejects.toThrow(
          CLUB_USER_BANNED_ERROR,
        );
      });
    });
  });

  describe("validateMembershipDoesNotExist", () => {
    it("passes when membership does not exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      await t.runWithCtx(async (ctx) => {
        await expect(validateMembershipDoesNotExist(ctx, clubId, userId)).resolves.toBeUndefined();
      });
    });

    it("throws when membership exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      await clubHelpers.insertMembership(createTestClubMembership(clubId, userId));

      await t.runWithCtx(async (ctx) => {
        await expect(validateMembershipDoesNotExist(ctx, clubId, userId)).rejects.toThrow(
          CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR,
        );
      });
    });
  });

  describe("validateMembershipExists", () => {
    it("returns membership when exists", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      const membershipRecord = await clubHelpers.insertMembership(
        createTestClubMembership(clubId, userId),
      );

      await t.runWithCtx(async (ctx) => {
        const result = await validateMembershipExists(ctx, clubId, userId);
        expect(result).toBeDefined();
        expect(result._id).toBe(membershipRecord._id);
      });
    });

    it("throws when membership does not exist", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));
      const clubId = clubRecord._id;

      await t.runWithCtx(async (ctx) => {
        await expect(validateMembershipExists(ctx, clubId, userId)).rejects.toThrow(
          CLUB_MEMBERSHIP_REQUIRED_ERROR,
        );
      });
    });
  });

  describe("isClubOwner", () => {
    it("returns true when user is owner", async () => {
      const owner = await userHelpers.insertUser();
      const ownerId = owner._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));

      expect(isClubOwner(clubRecord, ownerId)).toBe(true);
    });

    it("returns false when user is not owner", async () => {
      const owner = await userHelpers.insertUser();
      const user = await userHelpers.insertUser();
      const ownerId = owner._id;
      const userId = user._id;
      const clubRecord = await clubHelpers.insertClub(createTestClub(ownerId));

      expect(isClubOwner(clubRecord, userId)).toBe(false);
    });
  });
});
