import Google from "@auth/core/providers/google";
import Facebook from "@auth/core/providers/facebook";import { convexAuth } from "@convex-dev/auth/server";
import { MutationCtx } from "./_generated/server";
import { findUserByEmail } from "./users";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, Facebook],
  callbacks: {
    // `args.type` is one of "oauth" | "email" | "phone" | "credentials" | "verification"
    // `args.provider` is the currently used provider config
    async createOrUpdateUser(ctx: MutationCtx, args) {
      if (args.existingUserId) {
        // Optionally merge updated fields into the existing user object here
        return args.existingUserId;
      }
 
      // Implement your own account linking logic:
      const existingUser = await findUserByEmail(ctx, args.profile.email);
      if (existingUser) return existingUser._id;
 
      return ctx.db.insert("users", {
        email: args.profile.email,
      });
    },
  },
});
