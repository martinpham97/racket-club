import { DataModel } from "@/convex/_generated/dataModel";
import { withSystemFields, zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable, DocumentByName } from "convex/server";
import z from "zod";

export const skillLevelSchema = z.enum(["A", "B", "C", "D", "E", "OPEN"]);
export const preferredPlayStyleSchema = z.enum(["MS", "MD", "WS", "WD", "XD"]);
export const genderSchema = z.enum(["M", "F"]);

export const userProfileSchema = z.object({
  userId: zid("users"),
  firstName: z
    .string()
    .nonempty("First name is required.")
    .max(64, "First name must be 64 characters or fewer."),
  lastName: z
    .string()
    .nonempty("Last name is required.")
    .max(64, "Last name must be 64 characters or fewer."),
  gender: genderSchema.optional(),
  dob: z.number().optional(),
  skillLevel: skillLevelSchema.optional(),
  preferredPlayStyle: preferredPlayStyleSchema.optional(),
  bio: z.string().max(300, "Bio must be 300 characters or fewer.").optional(),
  isAdmin: z.boolean(),
});

const baseUserDetailsSchema = z.object({
  ...withSystemFields("users", { email: z.string().optional() }),
});

const userProfileWithSystemFields = z.object(
  withSystemFields("userProfiles", userProfileSchema.shape),
);

export const userDetailsSchema = baseUserDetailsSchema.extend({
  profile: userProfileWithSystemFields.nullable(),
});

export const userDetailsWithProfileSchema = baseUserDetailsSchema.extend({
  profile: userProfileWithSystemFields,
});

export const userProfileCreateSchema = userProfileSchema.omit({ isAdmin: true });
export const userProfileUpdateSchema = userProfileCreateSchema.partial().required({ userId: true });

export type UserProfileCreateInput = z.infer<typeof userProfileCreateSchema>;
export type UserProfileUpdateInput = z.infer<typeof userProfileUpdateSchema>;
export type User = DocumentByName<DataModel, "users">;
export type UserProfile = DocumentByName<DataModel, "userProfiles">;
export type UserDetails = z.infer<typeof userDetailsSchema>;
export type UserDetailsWithProfile = z.infer<typeof userDetailsWithProfileSchema>;

export const userProfileTable = defineTable(zodToConvex(userProfileSchema))
  .index("userId", ["userId"])
  .index("isAdmin", ["isAdmin"]);

export const userTables = {
  userProfiles: userProfileTable,
};
