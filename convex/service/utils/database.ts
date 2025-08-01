import { DataModel } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import { Rules } from "convex-helpers/server/rowLevelSecurity";
import { CurrentUser } from "../users/schemas";

export async function rlsRules(ctx: QueryCtx, currentUser?: CurrentUser) {
  const isAuthenticated = () => !!currentUser;
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
}
