import Facebook from "@auth/core/providers/facebook";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { MutationCtx } from "./_generated/server";
import { findUserByEmail } from "./dto/users";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Facebook],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }

      const existingUser = await findUserByEmail(ctx, args.profile.email);
      if (existingUser) return existingUser._id;

      return ctx.db.insert("users", {
        email: args.profile.email,
      });
    },
  },
});
