import { Id } from "@/convex/_generated/dataModel";
import { UserDetails } from "@/convex/service/users/schemas";
import { describe, expect, it } from "vitest";
import { isOwnerOrSystemAdmin } from "../auth";

describe("isOwnerOrSystemAdmin", () => {
  const userId = "user123" as Id<"users">;
  const otherUserId = "user456" as Id<"users">;

  it("returns true when user is the owner", () => {
    const currentUser: UserDetails = {
      _id: userId,
      _creationTime: Date.now(),
      email: "test@example.com",
      profile: {
        _id: "profile123" as Id<"userProfiles">,
        _creationTime: Date.now(),
        userId,
        firstName: "John",
        lastName: "Doe",
        isAdmin: false,
      },
    };

    expect(isOwnerOrSystemAdmin(currentUser, userId)).toBe(true);
  });

  it("returns true when user is an admin", () => {
    const currentUser: UserDetails = {
      _id: otherUserId,
      _creationTime: Date.now(),
      email: "admin@example.com",
      profile: {
        _id: "profile456" as Id<"userProfiles">,
        _creationTime: Date.now(),
        userId: otherUserId,
        firstName: "Admin",
        lastName: "User",
        isAdmin: true,
      },
    };

    expect(isOwnerOrSystemAdmin(currentUser, userId)).toBe(true);
  });

  it("returns false when user is neither owner nor admin", () => {
    const currentUser: UserDetails = {
      _id: otherUserId,
      _creationTime: Date.now(),
      email: "regular@example.com",
      profile: {
        _id: "profile456" as Id<"userProfiles">,
        _creationTime: Date.now(),
        userId: otherUserId,
        firstName: "Regular",
        lastName: "User",
        isAdmin: false,
      },
    };

    expect(isOwnerOrSystemAdmin(currentUser, userId)).toBe(false);
  });

  it("returns false when user has no profile", () => {
    const currentUser: UserDetails = {
      _id: otherUserId,
      _creationTime: Date.now(),
      email: "noprofile@example.com",
      profile: null,
    };

    expect(isOwnerOrSystemAdmin(currentUser, userId)).toBe(false);
  });
});
