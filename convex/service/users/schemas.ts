import { DataModel } from "@/convex/_generated/dataModel";
import { defineEnt } from "convex-ents";
import { withSystemFields, zid, zodToConvex } from "convex-helpers/server/zod";
import { DocumentByName } from "convex/server";
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

export const baseUserSchema = z.object({
  name: z.optional(z.string()),
  image: z.optional(z.string().url()),
  emailVerificationTime: z.optional(z.number()),
  phone: z.optional(z.string()),
  phoneVerificationTime: z.optional(z.number()),
  isAnonymous: z.optional(z.boolean()),
});

const baseUserDetailsSchema = z.object(
  withSystemFields("users", { ...baseUserSchema.shape, email: z.string().email().optional() }),
);

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

export const userProfileInputSchema = userProfileCreateSchema;

export const userProfileTable = defineEnt(zodToConvex(userProfileSchema))
  .index("isAdmin", ["isAdmin"])
  .edge("user", { to: "users", field: "userId" });

export const userTable = defineEnt(zodToConvex(baseUserSchema))
  .field("email", zodToConvex(z.string().email().optional()), { unique: true })
  // 1:1 Profile relationship
  .edge("profile", { to: "userProfiles", ref: "userId" })
  // Club ownership and membership
  .edges("createdClubs", { to: "clubs", ref: "createdBy" })
  .edges("clubMemberships", { to: "clubMemberships", ref: "userId" })
  // Ban relationships (dual perspective)
  .edges("clubBanRecords", { to: "clubBans", ref: "userId" })
  .edges("bannedUsers", { to: "clubBans", ref: "bannedBy" })
  // Event creation and participation
  .edges("createdEventSeries", { to: "eventSeries", ref: "createdBy" })
  .edges("createdEvents", { to: "events", ref: "createdBy" })
  .edges("eventParticipations", { to: "eventParticipants", ref: "userId" })
  // Activities
  .edges("activities", { to: "activities", ref: "userId" });

export const userTables = {
  users: userTable,
  userProfiles: userProfileTable,
};
