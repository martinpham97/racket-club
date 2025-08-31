import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import { PaginationOptions, PaginationResult } from "convex/server";
import { Club, ClubCreateInput, ClubDetails, ClubMembership } from "./schemas";

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
 * Lists all clubs that the user is a member of with pagination.
 * @param ctx Mutation context
 * @param userId User ID to list clubs for
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Paginated result of user's clubs with membership details
 */
export const listClubsForUser = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<ClubDetails>> => {
  const memberships = await ctx.db
    .query("clubMemberships")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .paginate(paginationOpts);
  const userClubs = (
    await Promise.all(
      memberships.page.map(async (membership) => {
        const club = await ctx.db.get(membership.clubId);
        return club ? ({ ...club, membership } as ClubDetails) : null;
      }),
    )
  ).filter(Boolean) as ClubDetails[];
  return { ...memberships, page: userClubs };
};

/**
 * Creates a new club with the authenticated user as the creator.
 * @param ctx Mutation context
 * @param input Club creation data
 * @param createdBy User ID of club creator
 * @returns ID of the created club
 */
export const createClub = async (
  ctx: MutationCtx,
  input: Omit<ClubCreateInput, "membershipInfo">,
  createdBy: Id<"users">,
): Promise<Id<"clubs">> => {
  return await ctx.db.insert("clubs", {
    ...input,
    isApproved: false,
    createdBy,
    numMembers: 0,
  });
};

/**
 * Updates an existing club with new data.
 * @param ctx Mutation context
 * @param clubId Club ID to update
 * @param input Club update data
 */
export const updateClub = async (
  ctx: MutationCtx,
  clubId: Id<"clubs">,
  input: Partial<Club>,
): Promise<void> => {
  return await ctx.db.patch(clubId, input);
};

/**
 * Deletes all memberships for the given club
 * @param ctx Mutation context
 * @param clubId Club ID
 */
export const deleteAllClubMemberships = async (
  ctx: MutationCtx,
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
 * Lists all members for a specific club.
 * @param ctx Query context
 * @param clubId Club ID to get members for
 * @returns Array of club memberships
 */
export const listAllClubMembers = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
): Promise<ClubMembership[]> => {
  return await ctx.db
    .query("clubMemberships")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId))
    .collect();
};

/**
 * Gets a user's ban record for the given club if exists
 * @param ctx Mutation context
 * @param clubId Club ID
 * @param userId User ID
 * @returns Ban record if exists, else null
 */
export const getClubBanRecordForUser = async (
  ctx: MutationCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
) => {
  return await ctx.db
    .query("clubBans")
    .withIndex("clubUser", (q) => q.eq("clubId", clubId).eq("userId", userId))
    .filter((q) => q.eq(q.field("isActive"), true))
    .unique();
};
