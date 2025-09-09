import { Id } from "@/convex/_generated/dataModel";
import { CLUB_MEMBERSHIP_NOT_FOUND_ERROR, CLUB_NOT_FOUND_ERROR } from "@/convex/constants/errors";
import { MutationCtx, QueryCtx } from "@/convex/types";
import { PaginationOptions, PaginationResult } from "convex/server";
import { ConvexError } from "convex/values";
import { Club, ClubBan, ClubCreateInput, ClubDetails, ClubMembership } from "./schemas";

/**
 * Gets a club by its ID or throw if does not exist
 * @param ctx Query context
 * @param clubId Club ID to retrieve
 * @returns Club docum if found
 * @throws {ConvexError} When club is not found
 */
export const getClubOrThrow = async (ctx: QueryCtx, clubId: Id<"clubs">): Promise<Club> => {
  const club = await ctx.table("clubs").get(clubId);
  if (!club) {
    throw new ConvexError(CLUB_NOT_FOUND_ERROR);
  }
  return club;
};

/**
 * Gets a club membership by its ID or throw if does not exist
 * @param ctx Query context
 * @param clubMembershipId Club membership ID to retrieve
 * @returns Club membership if found
 * @throws {ConvexError} When club membership is not found
 */
export const getClubMembershipOrThrow = async (
  ctx: QueryCtx,
  clubMembershipId: Id<"clubMemberships">,
): Promise<ClubMembership> => {
  const membership = await ctx.table("clubMemberships").get(clubMembershipId);
  if (!membership) {
    throw new ConvexError(CLUB_MEMBERSHIP_NOT_FOUND_ERROR);
  }
  return membership;
};

/**
 * Gets the user's membership for a specific club.
 * @param ctx Query context
 * @param clubId Club ID to get membership for
 * @param userId User ID to get membership for
 * @returns Club membership if user is a member, null otherwise
 */
export const getClubMembershipForUser = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<ClubMembership | null> => {
  return await ctx
    .table("clubMemberships", "userClub", (q) => q.eq("userId", userId).eq("clubId", clubId))
    .unique();
};

/**
 * Lists all public and approved clubs with pagination.
 * Results are sorted by club name in ascending order.
 * @param ctx Query context
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Paginated result of public clubs
 */
export const listPublicClubs = async (
  ctx: QueryCtx,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Club>> => {
  return await ctx
    .table("clubs", "publicApprovedName", (q) => q.eq("isPublic", true).eq("isApproved", true))
    .order("asc")
    .paginate(paginationOpts);
};

/**
 * Lists all clubs that the user is a member of with pagination.
 * @param ctx Query context
 * @param userId User ID to list clubs for
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Paginated result of user's clubs with membership details
 */
export const listClubsForUser = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<ClubDetails>> => {
  const memberships = await ctx
    .table("clubMemberships", "userId", (q) => q.eq("userId", userId))
    .paginate(paginationOpts);

  const userClubs = await Promise.all(
    memberships.page.map(async (membership) => {
      const club = await membership.edge("club");
      return { ...club, membership } as ClubDetails;
    }),
  );

  return {
    ...memberships,
    page: userClubs,
  };
};

/**
 * Creates a new Club with the authicated user as the creator.
 * @param ctx Mutation context
 * @param input Club creation data
 * @param createdBy User ID of club creator
 * @returns Created club
 */
export const createClub = async (
  ctx: MutationCtx,
  input: ClubCreateInput,
  createdBy: Id<"users">,
): Promise<Club> => {
  return await ctx
    .table("clubs")
    .insert({
      ...input,
      createdBy,
      isApproved: false,
      numMembers: 0,
    })
    .get();
};

/**
 * Updates an existing club with new data.
 * @param ctx Mutation context
 * @param clubId Club ID to update
 * @param input Club update data
 * @returns The updated club details
 */
export const updateClub = async (
  ctx: MutationCtx,
  clubId: Id<"clubs">,
  input: Partial<Club>,
): Promise<Club> => {
  return await ctx.table("clubs").getX(clubId).patch(input).get();
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
  const club = await ctx.table("clubs").getX(clubId);
  const memberships = await club.edge("memberships");
  for (const membership of memberships) {
    await ctx.table("clubMemberships").getX(membership._id).delete();
  }
  await club.patch({ numMembers: 0 });
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
  return await ctx.table("clubs").getX(clubId).edge("memberships");
};

/**
 * Gets a user's active ban record for the given club if exists
 * @param ctx Query context
 * @param clubId Club ID
 * @param userId User ID
 * @returns Ban record if exists, else null
 */
export const getActiveClubBanRecordForUser = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  userId: Id<"users">,
): Promise<ClubBan | null> => {
  return await ctx
    .table("clubBans", "activeClubUser", (q) =>
      q.eq("isActive", true).eq("clubId", clubId).eq("userId", userId),
    )
    .unique();
};

/**
 * Gets active ban records for the given club
 * @param ctx Query context
 * @param clubId Club ID
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Ban records
 */
export const getActiveClubBanRecords = async (
  ctx: QueryCtx,
  clubId: Id<"clubs">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<ClubBan>> => {
  return await ctx
    .table("clubBans", "activeClubUser", (q) => q.eq("isActive", true).eq("clubId", clubId))
    .paginate(paginationOpts);
};

/**
 * Gets all club IDs where the user is a member.
 * @param ctx Query context
 * @param userId User ID to get club memberships for
 * @returns Array of club IDs the user is a member of
 * @throws {ConvexError} When user is not found
 */
export const listUserClubIds = async (
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"clubs">[]> => {
  const memberships = await ctx.table("users").getX(userId).edge("clubMemberships");
  return memberships.map((m) => m.clubId);
};

/**
 * Updates an existing club membership with new data.
 * @param ctx Mutation context
 * @param membershipId Club membership ID to update
 * @param input Club membership update data
 * @returns The updated club membership details
 */
export const updateClubMembership = async (
  ctx: MutationCtx,
  membershipId: Id<"clubMemberships">,
  input: Partial<ClubMembership>,
): Promise<ClubMembership> => {
  return await ctx.table("clubMemberships").getX(membershipId).patch(input).get();
};
