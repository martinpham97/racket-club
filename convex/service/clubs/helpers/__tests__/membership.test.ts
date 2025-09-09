import { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import {
  addUserToClub,
  createClubMembershipInfo,
  updateClubMemberCount,
} from "@/convex/service/clubs/helpers/membership";
import { convexTest } from "@/convex/setup.testing";
import { ClubTestHelpers, createTestClub } from "@/test-utils/samples/clubs";
import { createTestProfile, UserTestHelpers } from "@/test-utils/samples/users";
import { beforeEach, describe, expect, it } from "vitest";

describe("Membership Helpers", () => {
  let t: ReturnType<typeof convexTest>;
  let clubHelpers: ClubTestHelpers;
  let userHelpers: UserTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    clubHelpers = new ClubTestHelpers(t);
    userHelpers = new UserTestHelpers(t);
  });

  describe("createClubMembershipInfo", () => {
    it("creates membership info with user profile defaults", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(
        createTestProfile(userId, {
          firstName: "John",
          lastName: "Doe",
          gender: "M",
          skillLevel: "B",
          preferredPlayStyle: "MS",
        }),
      );
      const userDetails = { ...user, profile };
      const clubId = "test-club-id" as Id<"clubs">;

      const result = createClubMembershipInfo(userDetails, clubId);

      expect(result.clubId).toBe(clubId);
      expect(result.userId).toBe(userId);
      expect(result.name).toBe("John Doe");
      expect(result.gender).toBe("M");
      expect(result.skillLevel).toBe("B");
      expect(result.preferredPlayStyle).toBe("MS");
      expect(result.isApproved).toBe(false);
      expect(result.isClubAdmin).toBe(false);
      expect(result.joinedAt).toBeTypeOf("number");
    });

    it("overrides profile defaults with provided membership info", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(
        createTestProfile(userId, {
          firstName: "John",
          lastName: "Doe",
          gender: "M",
          skillLevel: "B",
        }),
      );
      const userDetails = { ...user, profile };
      const clubId = "test-club-id" as Id<"clubs">;
      const membershipInfo = {
        name: "Custom Name",
        gender: "F" as const,
        skillLevel: "A" as const,
        preferredPlayStyle: "WS" as const,
      };

      const result = createClubMembershipInfo(userDetails, clubId, membershipInfo);

      expect(result.name).toBe("Custom Name");
      expect(result.gender).toBe("F");
      expect(result.skillLevel).toBe("A");
      expect(result.preferredPlayStyle).toBe("WS");
    });

    it("handles partial membership info overrides", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(
        createTestProfile(userId, {
          firstName: "John",
          lastName: "Doe",
          gender: "M",
          skillLevel: "B",
        }),
      );
      const userDetails = { ...user, profile };
      const clubId = "test-club-id" as Id<"clubs">;
      const membershipInfo = { name: "Custom Name" };

      const result = createClubMembershipInfo(userDetails, clubId, membershipInfo);

      expect(result.name).toBe("Custom Name");
      expect(result.gender).toBe("M"); // From profile
      expect(result.skillLevel).toBe("B"); // From profile
    });
  });

  describe("updateClubMemberCount", () => {
    it("updates club member count when delta changes count", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId, { numMembers: 5 }));

      const result = await t.runWithCtx((ctx) => updateClubMemberCount(ctx, club, 2));

      expect(result.numMembers).toBe(7);
      const updatedClub = await clubHelpers.getClub(club._id);
      expect(updatedClub!.numMembers).toBe(7);
    });

    it("prevents negative member count", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId, { numMembers: 2 }));

      const result = await t.runWithCtx((ctx) => updateClubMemberCount(ctx, club, -5));

      expect(result.numMembers).toBe(0);
      const updatedClub = await clubHelpers.getClub(club._id);
      expect(updatedClub!.numMembers).toBe(0);
    });

    it("does not update when delta results in same count", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const club = await clubHelpers.insertClub(createTestClub(userId, { numMembers: 5 }));

      const result = await t.runWithCtx((ctx) => updateClubMemberCount(ctx, club, 0));

      expect(result.numMembers).toBe(5);
      const updatedClub = await clubHelpers.getClub(club._id);
      expect(updatedClub!.numMembers).toBe(5);
    });
  });

  describe("addUserToClub", () => {
    it("adds user to club with default options", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(
        createTestProfile(userId, { firstName: "John", lastName: "Doe" }),
      );
      const userDetails = { ...user, profile };
      const club = await clubHelpers.insertClub(createTestClub(userId, { numMembers: 0 }));

      const result = await t.runWithCtx((ctx) => addUserToClub(ctx, userDetails, club));

      expect(result.membership.clubId).toBe(club._id);
      expect(result.membership.userId).toBe(userId);
      expect(result.membership.name).toBe("John Doe");
      expect(result.membership.isApproved).toBe(false);
      expect(result.membership.isClubAdmin).toBe(false);
      expect(result.numMembers).toBe(1);
    });

    it("adds user as approved admin when isAdmin option is true", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));
      const userDetails = { ...user, profile };
      const club = await clubHelpers.insertClub(createTestClub(userId));

      const result = await t.runWithCtx((ctx) =>
        addUserToClub(ctx, userDetails, club, { isAdmin: true }),
      );

      expect(result.membership.isApproved).toBe(true);
      expect(result.membership.isClubAdmin).toBe(true);
    });

    it("adds user as approved non-admin when isApproved is true", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));
      const userDetails = { ...user, profile };
      const club = await clubHelpers.insertClub(createTestClub(userId));

      const result = await t.runWithCtx((ctx) =>
        addUserToClub(ctx, userDetails, club, { isApproved: true }),
      );

      expect(result.membership.isApproved).toBe(true);
      expect(result.membership.isClubAdmin).toBe(false);
    });

    it("uses custom membership info when provided", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));
      const userDetails = { ...user, profile };
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const membershipInfo = {
        name: "Custom Name",
        gender: "F" as const,
        skillLevel: "A" as const,
      };

      const result = await t.runWithCtx((ctx) =>
        addUserToClub(ctx, userDetails, club, { membershipInfo }),
      );

      expect(result.membership.name).toBe("Custom Name");
      expect(result.membership.gender).toBe("F");
      expect(result.membership.skillLevel).toBe("A");
    });

    it("updates club member count", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));
      const userDetails = { ...user, profile };
      const club = await clubHelpers.insertClub(createTestClub(userId, { numMembers: 3 }));

      const result = await t.runWithCtx((ctx) => addUserToClub(ctx, userDetails, club));

      expect(result.numMembers).toBe(4);
      const updatedClub = await clubHelpers.getClub(club._id);
      expect(updatedClub!.numMembers).toBe(4);
    });

    it("sets joinedAt timestamp", async () => {
      const user = await userHelpers.insertUser();
      const userId = user._id;
      const profile = await userHelpers.insertProfile(createTestProfile(userId));
      const userDetails = { ...user, profile };
      const club = await clubHelpers.insertClub(createTestClub(userId));
      const beforeTime = Date.now();

      const result = await t.runWithCtx((ctx) => addUserToClub(ctx, userDetails, club));

      const afterTime = Date.now();
      expect(result.membership.joinedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(result.membership.joinedAt).toBeLessThanOrEqual(afterTime);
    });
  });
});
