import { DataModel } from "@/convex/_generated/dataModel";
import {
  genderSchema,
  preferredPlayStyleSchema,
  skillLevelSchema,
} from "@/convex/service/users/schemas";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable, DocumentByName } from "convex/server";
import z from "zod";

export const clubSchema = z.object({
  name: z.string().max(128, "Name must be less than 128 characters long."),
  description: z
    .string()
    .max(1000, "Description must be less than 1000 characters long.")
    .optional(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  type: z.enum(["social", "training"]),
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

export const clubMembershipInputSchema = clubMembershipSchema.pick({
  name: true,
  gender: true,
  skillLevel: true,
  preferredPlayStyle: true,
});
export type ClubMembershipInput = z.infer<typeof clubMembershipInputSchema>;

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
export type ClubMembershipUpdateInput = z.infer<typeof clubMembershipUpdateInputSchema>;

export const clubCreateInputSchema = clubSchema.omit({
  createdBy: true,
  isApproved: true,
  numMembers: true,
});
export type ClubCreateInput = z.infer<typeof clubCreateInputSchema>;

export const clubUpdateInputSchema = clubSchema.partial();
export type ClubUpdateInput = z.infer<typeof clubUpdateInputSchema>;

export type Club = DocumentByName<DataModel, "clubs">;
export type ClubMembership = DocumentByName<DataModel, "clubMemberships">;

export type MyClub = DocumentByName<DataModel, "clubs"> & {
  membership: ClubMembership;
};

export const clubTable = defineTable(zodToConvex(clubSchema))
  .index("createdBy", ["createdBy"])
  .index("publicApproved", ["isPublic", "isApproved"])
  .index("publicName", ["isPublic", "name"]);

export const clubMembershipTable = defineTable(zodToConvex(clubMembershipSchema))
  .index("clubApproved", ["clubId", "isApproved"])
  .index("userId", ["userId"])
  .index("clubUser", ["clubId", "userId"]);

export const clubBanSchema = z.object({
  clubId: zid("clubs"),
  userId: zid("users"),
  bannedBy: zid("users"),
  bannedAt: z.number(),
  reason: z.string().max(500, "Ban reason must be less than 500 characters").optional(),
  isActive: z.boolean(),
});

export const clubBanTable = defineTable(zodToConvex(clubBanSchema))
  .index("clubUser", ["clubId", "userId"])
  .index("clubActive", ["clubId", "isActive"])
  .index("userId", ["userId"]);

export type ClubBan = DocumentByName<DataModel, "clubBans">;

export const clubTables = {
  clubs: clubTable,
  clubMemberships: clubMembershipTable,
  clubBans: clubBanTable,
};
