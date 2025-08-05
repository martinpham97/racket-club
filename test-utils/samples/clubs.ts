import { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import { Club, ClubCreateInput, ClubMembership } from "@/convex/service/clubs/schemas";
import { TestConvex } from "convex-test";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestClubInput = (overrides?: Partial<ClubCreateInput>): ClubCreateInput => {
  return {
    name: `Test Club`,
    description: "Test club description",
    type: "social",
    isPublic: true,
    maxMembers: 50,
    location: {
      address: "123 Test St",
      placeId: "test-place-id",
      name: "Test Location",
    },
    skillLevels: {
      min: 1,
      max: 5,
    },
    ...overrides,
  };
};

export const createTestClub = (
  createdBy: Id<"users">,
  overrides?: Partial<Club>,
): WithoutSystemFields<Club> => {
  return {
    ...createTestClubInput(overrides),
    createdBy,
    isApproved: false,
    numMembers: 0,
    ...overrides,
  };
};

export const createTestClubRecord = (createdBy: Id<"users">, overrides?: Partial<Club>): Club => {
  return {
    _id: genId<"clubs">("clubs"),
    _creationTime: Date.now(),
    ...createTestClub(createdBy, overrides),
  };
};

export const createTestClubMembership = (
  clubId: Id<"clubs">,
  userId: Id<"users">,
  overrides?: Partial<ClubMembership>,
): WithoutSystemFields<ClubMembership> => {
  return {
    clubId,
    userId,
    name: "Test Member",
    isApproved: true,
    isClubAdmin: false,
    joinedAt: Date.now(),
    ...overrides,
  };
};

export const createTestClubMembershipRecord = (
  clubId: Id<"clubs">,
  userId: Id<"users">,
  overrides?: Partial<ClubMembership>,
): ClubMembership => {
  return {
    _id: genId<"clubMemberships">("clubMemberships"),
    _creationTime: Date.now(),
    ...createTestClubMembership(clubId, userId, overrides),
  };
};

export class ClubTestHelpers {
  constructor(private t: TestConvex<typeof schema>) {}

  async insertClub(club: WithoutSystemFields<Club>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("clubs", club);
    });
  }

  async deleteClub(clubId: Id<"clubs">) {
    return await this.t.run(async (ctx) => ctx.db.delete(clubId));
  }

  async insertMembership(membership: WithoutSystemFields<ClubMembership>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("clubMemberships", membership);
    });
  }

  async approveClub(clubId: Id<"clubs">) {
    return await this.t.run(async (ctx) => ctx.db.patch(clubId, { isApproved: true }));
  }

  async getClubRecord(clubId: Id<"clubs">) {
    return await this.t.run(async (ctx) => ctx.db.get(clubId));
  }

  async getMembership(membershipId: Id<"clubMemberships">) {
    return await this.t.run(async (ctx) => ctx.db.get(membershipId));
  }

  async getMembershipForUser(clubId: Id<"clubs">, userId: Id<"users">) {
    return await this.t.run(async (ctx) =>
      ctx.db
        .query("clubMemberships")
        .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", userId))
        .unique(),
    );
  }

  async deleteClubMembership(membershipId: Id<"clubMemberships">) {
    return await this.t.run(async (ctx) => ctx.db.delete(membershipId));
  }
}
