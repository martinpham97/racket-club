import { DataModel, Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import { UserDetails } from "@/convex/service/users/schemas";
import { Rules } from "convex-helpers/server/rowLevelSecurity";

/**
 * Defines row-level security (RLS) rules for database operations.
 * @param ctx Query context
 * @param currentUser Current authenticated user with profile details
 * @returns RLS rules object defining read/insert/modify permissions for each table
 */
export const rlsRules = async (ctx: QueryCtx, currentUser?: UserDetails) => {
  const isAdmin = () => !!currentUser?.profile?.isAdmin;
  const isOwner = (userId: Id<"users">) => userId === currentUser?._id;
  const isOwnerOrAdmin = (userId: Id<"users">) => isOwner(userId) || isAdmin();

  return {
    users: {
      read: async () => true,
      insert: async () => true,
      modify: async () => isAdmin(),
    },
    userProfiles: {
      read: async () => true,
      insert: async (_, userProfile) => isOwnerOrAdmin(userProfile.userId),
      modify: async (_, userProfile) => isOwnerOrAdmin(userProfile.userId),
    },
    clubs: {
      read: async () => true,
      insert: async () => !!currentUser,
      modify: async () => !!currentUser,
    },
    clubMemberships: {
      read: async () => true,
      insert: async () => !!currentUser,
      modify: async () => !!currentUser,
    },
    clubBans: {
      read: async () => true,
      // Only authenticated user can ban/unban other users
      insert: async (_, ban) => !!currentUser && !isOwner(ban.userId),
      modify: async (_, ban) => !!currentUser && !isOwner(ban.userId),
    },
  } satisfies Rules<QueryCtx, DataModel>;
};
