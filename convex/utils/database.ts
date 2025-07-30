import { getAuthUserId } from "@convex-dev/auth/server";
import { Rules } from "convex-helpers/server/rowLevelSecurity";
import { DataModel } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../service/users/database";

/**
 * Row-level security rules
 * @param ctx Context
 * @returns Rule
 */
export async function rlsRules(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  return {
    users: {
      read: async () => {
        // Unauthenticated users cannot view users
        return !!userId;
      },
      insert: async () => {
        // Anyone can register
        return true;
      },
      modify: async (ctx) => {
        const currentUser = await getCurrentUser(ctx);
        // Only Admin can modify users
        return !!currentUser?.profile?.isAdmin;
      },
    },
    userProfiles: {
      read: async () => {
        // Unauthenticated users cannot view profiles
        return !!userId;
      },
      insert: async (_, userProfile) => {
        // Users can only create their own profile
        return userProfile.userId === userId;
      },
      modify: async (ctx, userProfile) => {
        const currentUser = await getCurrentUser(ctx);
        // Only authenticated user can modify their own profile
        // Admin can modify any profile
        return userProfile.userId === currentUser?._id || !!userProfile?.isAdmin;
      },
    },
  } satisfies Rules<QueryCtx, DataModel>;
}
