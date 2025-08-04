import { DataModel } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import { Rules } from "convex-helpers/server/rowLevelSecurity";
import { UserDetails } from "../users/schemas";

/**
 * Defines row-level security (RLS) rules for database operations.
 * @param ctx Query context
 * @param currentUser Current authenticated user with profile details
 * @returns RLS rules object defining read/insert/modify permissions for each table
 */
export const rlsRules = async (ctx: QueryCtx, currentUser?: UserDetails) => {
  const isAdmin = () => !!currentUser?.profile?.isAdmin;
  const isOwnerOrAdmin = (userId: string) => userId === currentUser?._id || isAdmin();

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
  } satisfies Rules<QueryCtx, DataModel>;
};
