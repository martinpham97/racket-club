import { Id, TableNames } from "@/convex/_generated/dataModel";
import { CurrentUser, User, UserProfile } from "@/convex/service/users/schemas";
import { WithoutSystemFields } from "convex/server";

let idCounter = 0;
export const genId = <T extends TableNames>(prefix: string): Id<T> =>
  `${prefix}_${++idCounter}` as Id<T>;

interface CreateTestUserArgs extends Omit<Partial<CurrentUser>, "profile"> {
  profile?: Partial<UserProfile> | null;
}

export function createTestProfile(
  userId: Id<"users">,
  profile?: Partial<UserProfile>,
): WithoutSystemFields<UserProfile> {
  return {
    userId,
    firstName: `User ${userId}`,
    lastName: "(Test Generated)",
    isAdmin: false,
    ...profile,
  };
}

export function createTestProfileRecord(
  userId: Id<"users">,
  profile?: Partial<UserProfile>,
): UserProfile {
  const id = genId<"userProfiles">("userProfiles");
  return {
    _id: id,
    _creationTime: Date.now(),
    ...createTestProfile(userId),
    ...profile,
  };
}

export function createTestUser(user?: Partial<User>): WithoutSystemFields<User> {
  return { email: "test@example.com", ...user };
}

export function createTestUserRecord({ profile, ...rest }: CreateTestUserArgs = {}): CurrentUser {
  const userId = genId<"users">("users");
  return {
    _id: userId,
    _creationTime: Date.now(),
    ...createTestUser(),
    ...rest,
    profile:
      profile === null
        ? null
        : {
            ...createTestProfileRecord(userId),
            ...profile,
          },
  };
}
