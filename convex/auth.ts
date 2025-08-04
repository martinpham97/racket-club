import Facebook from "@auth/core/providers/facebook";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { getOrCreateUser } from "./service/users/database";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Facebook],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      return await getOrCreateUser(ctx, {
        existingUserId: args.existingUserId,
        email: args.profile.email,
      });
    },
  },
});
