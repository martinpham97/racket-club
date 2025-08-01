import Facebook from "@auth/core/providers/facebook";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { createOrUpdateUser as dtoCreateOrUpdateUser } from "./service/users/database";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Facebook],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      return await dtoCreateOrUpdateUser(ctx, {
        existingUserId: args.existingUserId,
        email: args.profile.email,
      });
    },
  },
});
