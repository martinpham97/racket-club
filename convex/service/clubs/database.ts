"use server";

import { Id } from "@/convex/_generated/dataModel";
import { QueryCtx } from "@/convex/_generated/server";
import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { PaginationOptions, PaginationResult } from "convex/server";
import { Club, ClubCreateInput, ClubMembership, MyClub } from "./schemas";

/**
 * Gets a club by its ID.
 * @param ctx Query context
 * @param clubId Club ID to retrieve
 * @returns Club document if found, null otherwise
 */
export const getClub = async (ctx: QueryCtx, clubId: Id<"clubs">): Promise<Club | null> => {
  return await ctx.db.get(clubId);
};

/**
 * Gets the user's membership for a specific club.
 * @param ctx Query Ctx
 * @param clubId Club ID to get membership for
 * @param userId User Id to get membership for
 * @returns Club membership if user is a member, null otherwise
 */
export const getClubMembershipForUser = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<ClubMembership | null> => {
  return await ctx.db
    .query("clubMemberships")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", userId))
    .first();
};

/**
 * Lists all public and approved clubs with pagination.
 * @param ctx Query context
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Paginated result of public clubs
 */
export const listPublicClubs = async (
  ctx: QueryCtx,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Club>> => {
  return await ctx.db
    .query("clubs")
    .withIndex("publicApproved", (q) => q.eq("isPublic", true).eq("isApproved", true))
    .paginate(paginationOpts);
};

/**
 * Lists all clubs that the authenticated user is a member of with pagination.
 * @param ctx Authenticated context with profile
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Paginated result of user's clubs with membership details
 */
export const listMyClubs = async (
  ctx: AuthenticatedWithProfileCtx,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<MyClub>> => {
  const memberships = await ctx.db
    .query("clubMemberships")
    .withIndex("userId", (q) => q.eq("userId", ctx.currentUser._id))
    .paginate(paginationOpts);
  const clubPromises = memberships.page.map(async (m) => {
    const club = await ctx.db.get(m.clubId);
    return club ? ({ ...club, membership: m } as MyClub) : null;
  });
  const myClubs = (await Promise.all(clubPromises)).filter(Boolean) as MyClub[];
  return { ...memberships, page: myClubs };
};

/**
 * Creates a new club with the authenticated user as the creator.
 * @param ctx Authenticated context with profile
 * @param input Club creation data
 * @returns ID of the created club
 */
export const createClub = async (
  ctx: AuthenticatedWithProfileCtx,
  input: Omit<ClubCreateInput, "membershipInfo">,
): Promise<Id<"clubs">> => {
  return await ctx.db.insert("clubs", {
    ...input,
    isApproved: false,
    createdBy: ctx.currentUser._id,
    numMembers: 0,
  });
};

/**
 * Updates an existing club with new data.
 * @param ctx Authenticated context with profile
 * @param clubId Club ID to update
 * @param input Club update data
 */
export const updateClub = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
  input: Partial<Club>,
): Promise<void> => {
  return await ctx.db.patch(clubId, input);
};

/**
 * Deletes all memberships for the given club
 * @param ctx Authenticated context with profile
 * @param clubId Club ID
 */
export const deleteAllClubMemberships = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
): Promise<void> => {
  // Get and delete all memberships within the current club
  const memberships = await ctx.db
    .query("clubMemberships")
    .withIndex("clubApproved", (q) => q.eq("clubId", clubId))
    .collect();
  memberships.forEach(async (membership) => await ctx.db.delete(membership._id));
  await ctx.db.patch(clubId, { numMembers: 0 });
};

/**
 * Gets a user's ban record for the given club if exists
 * @param ctx Authenticated context with profile
 * @param clubId Club ID
 * @param userId User ID
 * @returns Ban record if exists, else null
 */
export const getClubBanRecordForUser = async (
  ctx: AuthenticatedWithProfileCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
) => {
  return await ctx.db
    .query("clubBans")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", userId))
    .filter((q) => q.eq(q.field("isActive"), true))
    .unique();
};
