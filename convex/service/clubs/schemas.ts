import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable } from "convex/server";
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
    .max(100, "You only can have up to 100 members."),
  createdBy: zid("users"),
  isApproved: z.boolean(),
  location: z.object({
    address: z.string(),
    placeId: z.string(),
    name: z.string(),
  }),
  skillLevels: z.object({
    min: z.number().nonnegative().max(5),
    max: z.number().nonnegative().max(5),
  }),
});

export const clubMembershipSchema = z.object({
  clubId: zid("clubs"),
  userId: zid("users"),
  isApproved: z.boolean(),
  isClubAdmin: z.boolean(),
  joinedAt: z.number(),
});

export const clubInputSchema = clubSchema.omit({ createdBy: true, isApproved: true });
export type ClubInput = z.infer<typeof clubInputSchema>;

export const clubTable = defineTable(zodToConvex(clubSchema))
  .index("createdBy", ["createdBy"])
  .index("publicApproved", ["isPublic", "isApproved"]);

export const clubMembershipTable = defineTable(zodToConvex(clubMembershipSchema))
  .index("clubId", ["clubId"])
  .index("userId", ["userId"])
  .index("clubUser", ["clubId", "userId"]);

export const clubTables = {
  club: clubTable,
};
