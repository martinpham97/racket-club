import { Id } from "@/convex/_generated/dataModel";
import schema from "@/convex/schema";
import {
  User,
  UserDetails,
  UserDetailsWithProfile,
  UserProfile,
} from "@/convex/service/users/schemas";
import { TestConvex } from "convex-test";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

interface CreateTestUserArgs extends Omit<Partial<UserDetails>, "profile"> {
  profile?: Partial<UserProfile> | null;
}

type CreateTestUserReturn<T extends CreateTestUserArgs> = T["profile"] extends null
  ? UserDetails
  : UserDetailsWithProfile;

export const createTestProfile = (
  userId: Id<"users">,
  overrides?: Partial<UserProfile>,
): WithoutSystemFields<UserProfile> => {
  return {
    userId,
    firstName: `User ${userId}`,
    lastName: "(Test Generated)",
    isAdmin: false,
    ...overrides,
  };
};

export const createTestProfileRecord = (
  userId: Id<"users">,
  overrides?: Partial<UserProfile>,
): UserProfile => {
  const id = genId<"userProfiles">("userProfiles");
  return {
    _id: id,
    _creationTime: Date.now(),
    ...createTestProfile(userId, overrides),
  };
};

export const createTestUser = (overrides?: Partial<User>): WithoutSystemFields<User> => {
  return { email: "test@example.com", ...overrides };
};

export const createTestUserRecord = <T extends CreateTestUserArgs>(
  { profile, ...overrides }: T = {} as T,
): CreateTestUserReturn<T> => {
  const userId = genId<"users">("users");
  return {
    _id: userId,
    _creationTime: Date.now(),
    ...createTestUser(overrides),
    profile: profile === null ? null : createTestProfileRecord(userId, profile),
  } as CreateTestUserReturn<T>;
};

export class UserTestHelpers {
  constructor(private t: TestConvex<typeof schema>) {}

  async insertUser(email = "test@example.com") {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("users", { email });
    });
  }

  async insertProfile(profile: WithoutSystemFields<UserProfile>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("userProfiles", {
        ...profile,
      });
    });
  }

  async getProfile(profileId: Id<"userProfiles">) {
    return await this.t.run(async (ctx) => ctx.db.get(profileId));
  }

  async deleteProfile(profileId: Id<"userProfiles">) {
    return await this.t.run(async (ctx) => ctx.db.delete(profileId));
  }
}
