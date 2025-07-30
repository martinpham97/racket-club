import Facebook from "@auth/core/providers/facebook";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { MutationCtx } from "./_generated/server";
import { AUTH_PROVIDER_NO_EMAIL_ERROR } from "./constants/errors";
import { findUserByEmail } from "./service/users/database";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Facebook],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }

      if (!args.profile.email) {
        throw new ConvexError(AUTH_PROVIDER_NO_EMAIL_ERROR);
      }

      const existingUser = await findUserByEmail(ctx, args.profile.email);
      if (existingUser) return existingUser._id;

      return ctx.db.insert("users", {
        email: args.profile.email,
      });
    },
  },
});
