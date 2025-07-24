import { QueryCtx } from "./_generated/server";

export const findUserByEmail = async (ctx: QueryCtx, email?: string) => {
  if (!email) throw new Error("email is required");
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return user;
}
