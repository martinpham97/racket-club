import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable } from "convex/server";
import z from "zod";

export const userProfileSchema = z.object({
  userId: zid("users"),
  firstName: z.string().nonempty("First name is required"),
  lastName: z.string().nonempty("Last name is required"),
  gender: z.enum(["M", "F"]).optional(),
  dob: z.number().optional(),
  skillLevel: z.enum(["A", "B", "C", "D", "E", "OPEN"]).optional(),
  preferredPlayStyle: z.enum(["MS", "MD", "WS", "WD", "XD"]).optional(),
  bio: z.string().optional(),
  isAdmin: z.boolean(),
});

export const userProfileInputSchema = userProfileSchema.omit({ userId: true, isAdmin: true });

export type UserProfileInput = z.infer<typeof userProfileInputSchema>;

export const userProfileTable = defineTable(zodToConvex(userProfileSchema))
  .index("userId", ["userId"])
  .index("isAdmin", ["isAdmin"]);

export const userTables = {
  userProfiles: userProfileTable,
};
