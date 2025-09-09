import { Id } from "@/convex/_generated/dataModel";
import { Club, ClubBan, ClubCreateInput, ClubMembership } from "@/convex/service/clubs/schemas";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestClubInput = (overrides?: Partial<ClubCreateInput>): ClubCreateInput => {
  return {
    name: `Test Club`,
    description: "Test club description",
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

export const createTestClubBan = (
  clubId?: Id<"clubs">,
  userId?: Id<"users">,
  bannedBy?: Id<"users">,
  overrides?: Partial<ClubBan>,
): WithoutSystemFields<ClubBan> => ({
  clubId: clubId || genId<"clubs">("clubs"),
  userId: userId || genId<"users">("users"),
  bannedBy: bannedBy || genId<"users">("users"),
  bannedAt: Date.now(),
  reason: "Test ban reason",
  isActive: true,
  ...overrides,
});

export const createTestClubBanRecord = (
  clubId?: Id<"clubs">,
  userId?: Id<"users">,
  bannedBy?: Id<"users">,
  overrides?: Partial<ClubBan>,
): ClubBan => ({
  _id: genId<"clubBans">("clubBans"),
  _creationTime: Date.now(),
  ...createTestClubBan(clubId, userId, bannedBy, overrides),
});

export class ClubTestHelpers {
  constructor(private t: ReturnType<typeof import("@/convex/setup.testing").convexTest>) {}

  async getClub(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubs").getX(clubId));
  }

  async insertClub(club: WithoutSystemFields<Club>) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubs").insert(club).get());
  }

  async deleteClub(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubs").getX(clubId).delete());
  }

  async insertMembership(membership: WithoutSystemFields<ClubMembership>) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubMemberships").insert(membership).get());
  }

  async getMembership(membershipId: Id<"clubMemberships">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubMemberships").get(membershipId));
  }

  async insertClubBan(ban: WithoutSystemFields<ClubBan>) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubBans").insert(ban).get());
  }

  async getClubBan(banId: Id<"clubBans">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubBans").getX(banId));
  }

  async approveClub(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("clubs").getX(clubId).patch({ isApproved: true }),
    );
  }

  async getMembershipForUser(clubId: Id<"clubs">, userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) =>
      ctx
        .table("clubMemberships")
        .filter((q) => q.and(q.eq(q.field("clubId"), clubId), q.eq(q.field("userId"), userId)))
        .unique(),
    );
  }

  async getActiveBanForUser(clubId: Id<"clubs">, userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) =>
      ctx
        .table("clubBans")
        .filter((q) =>
          q.and(
            q.eq(q.field("clubId"), clubId),
            q.eq(q.field("userId"), userId),
            q.eq(q.field("isActive"), true),
          ),
        )
        .unique(),
    );
  }

  async listActiveBansForClub(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) =>
      ctx
        .table("clubBans")
        .filter((q) => q.and(q.eq(q.field("clubId"), clubId), q.eq(q.field("isActive"), true))),
    );
  }

  async deleteClubMembership(membershipId: Id<"clubMemberships">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("clubMemberships").getX(membershipId).delete(),
    );
  }

  async getClubRecord(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubs").get(clubId));
  }
}
