import { DataModel } from "@/convex/_generated/dataModel";
import {
  genderSchema,
  preferredPlayStyleSchema,
  skillLevelSchema,
} from "@/convex/service/users/schemas";
import { defineEnt } from "convex-ents";
import { withSystemFields, zid, zodToConvex } from "convex-helpers/server/zod";
import { DocumentByName } from "convex/server";
import z from "zod";

export const clubSchema = z.object({
  name: z.string().max(128, "Name must be less than 128 characters long."),
  description: z
    .string()
    .max(1000, "Description must be less than 1000 characters long.")
    .optional(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  isPublic: z.boolean(),
  maxMembers: z
    .number()
    .positive("Must be a positive number.")
    .max(100, "You only can have up to 100 members per club."),
  numMembers: z.number().nonnegative(),
  createdBy: zid("users"),
  isApproved: z.boolean(),
  location: z.object({
    address: z.string(),
    placeId: z.string(),
    name: z.string(),
  }),
  skillLevels: z
    .object({
      min: z.number().nonnegative().max(5),
      max: z.number().nonnegative().max(5),
    })
    .refine((data) => data.min <= data.max, {
      message: "Minimum skill level must be less than or equal to maximum skill level.",
      path: ["min"],
    }),
});

export const clubMembershipSchema = z.object({
  clubId: zid("clubs"),
  userId: zid("users"),
  name: z.string().max(128, "Your name must be less than 128 characters long."),
  gender: genderSchema.optional(),
  skillLevel: skillLevelSchema.optional(),
  preferredPlayStyle: preferredPlayStyleSchema.optional(),
  isApproved: z.boolean(),
  isClubAdmin: z.boolean(),
  joinedAt: z.number(),
});

export const clubBanReasonSchema = z
  .string()
  .min(10, "Ban reason must be at least 10 characters.")
  .max(500, "Ban reason must be less than 500 characters.");

export const clubBanSchema = z.object({
  clubId: zid("clubs"),
  userId: zid("users"),
  bannedBy: zid("users"),
  bannedAt: z.number(),
  reason: clubBanReasonSchema.optional(),
  isActive: z.boolean(),
});

export const clubMembershipInputSchema = clubMembershipSchema.pick({
  name: true,
  gender: true,
  skillLevel: true,
  preferredPlayStyle: true,
});

export const clubUpdateInputSchema = clubSchema.partial();

export const clubMembershipUpdateInputSchema = clubMembershipSchema
  .pick({
    name: true,
    gender: true,
    skillLevel: true,
    preferredPlayStyle: true,
    isApproved: true,
    isClubAdmin: true,
  })
  .partial();

export const clubCreateInputSchema = clubSchema.omit({
  createdBy: true,
  isApproved: true,
  numMembers: true,
});

export const clubDetailsSchema = z.object(withSystemFields("clubs", clubSchema.shape)).extend({
  membership: z.object(withSystemFields("clubMemberships", clubMembershipSchema.shape)),
});

export type ClubMembershipInput = z.infer<typeof clubMembershipInputSchema>;
export type ClubMembershipUpdateInput = z.infer<typeof clubMembershipUpdateInputSchema>;
export type ClubCreateInput = z.infer<typeof clubCreateInputSchema>;
export type ClubUpdateInput = z.infer<typeof clubUpdateInputSchema>;
export type Club = DocumentByName<DataModel, "clubs">;
export type ClubMembership = DocumentByName<DataModel, "clubMemberships">;
export type ClubBan = DocumentByName<DataModel, "clubBans">;
export type ClubDetails = z.infer<typeof clubDetailsSchema>;

export const clubTable = defineEnt(zodToConvex(clubSchema))
  .index("publicApprovedName", ["isPublic", "isApproved", "name"])
  .index("publicName", ["isPublic", "name"])
  .edge("createdBy", { to: "users", field: "createdBy" })
  .edges("memberships", { to: "clubMemberships", ref: "clubId" })
  .edges("clubBanRecords", { to: "clubBans", ref: "clubId" })
  .edges("events", { to: "events", ref: "clubId" })
  .edges("eventSeries", { to: "eventSeries", ref: "clubId" });

export const clubMembershipTable = defineEnt(zodToConvex(clubMembershipSchema))
  .index("userClub", ["userId", "clubId"])
  .edge("club", { to: "clubs", field: "clubId" })
  .edge("user", { to: "users", field: "userId" });

export const clubBanTable = defineEnt(zodToConvex(clubBanSchema))
  .index("activeClubUser", ["isActive", "clubId", "userId"])
  .edge("club", { to: "clubs", field: "clubId" })
  .edge("user", { to: "users", field: "userId" })
  .edge("bannedBy", { to: "users", field: "bannedBy" });

export const clubTables = {
  clubs: clubTable,
  clubMemberships: clubMembershipTable,
  clubBans: clubBanTable,
};
