import { Id } from "@/convex/_generated/dataModel";
import {
  User,
  UserDetails,
  UserDetailsWithProfile,
  UserProfile,
} from "@/convex/service/users/schemas";
import { convexTest } from "@/convex/setup.testing";
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

export const generateTestEmail = (prefix = "test"): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@example.com`;
};

export const createTestUser = (overrides?: Partial<User>): WithoutSystemFields<User> => {
  return { email: generateTestEmail(), ...overrides };
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
  constructor(private t: ReturnType<typeof convexTest>) {}

  async getUser(userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").getX(userId));
  }

  async insertUser(email = generateTestEmail()) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").insert({ email }).get());
  }

  async deleteUser(userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").getX(userId).delete());
  }

  async insertProfile(profile: WithoutSystemFields<UserProfile>) {
    return await this.t.runWithCtx((ctx) => ctx.table("userProfiles").insert(profile).get());
  }

  async getProfile(profileId: Id<"userProfiles">) {
    return await this.t.runWithCtx((ctx) => ctx.table("userProfiles").getX(profileId));
  }
}
