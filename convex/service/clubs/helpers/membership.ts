import { Id } from "@/convex/_generated/dataModel";
import { updateClub } from "@/convex/service/clubs/database";
import {
  Club,
  ClubDetails,
  ClubMembership,
  ClubMembershipInput,
} from "@/convex/service/clubs/schemas";
import { UserDetailsWithProfile } from "@/convex/service/users/schemas";
import { MutationCtx } from "@/convex/types";
import { WithoutSystemFields } from "convex/server";

interface AddUserToClubOptions {
  isApproved?: boolean;
  isAdmin?: boolean;
  membershipInfo?: ClubMembershipInput;
}

/**
 * Adds a user to a club with specified options and updates member count.
 * @param ctx Mutation context
 * @param userDetails User details with profile
 * @param club The club to join
 * @param options Join options including admin status, approval status and membership info
 * @returns Updated club details with created membership
 */
export const addUserToClub = async (
  ctx: MutationCtx,
  userDetails: UserDetailsWithProfile,
  club: Club,
  options?: AddUserToClubOptions,
): Promise<ClubDetails> => {
  const membershipInfo = {
    ...createClubMembershipInfo(userDetails, club._id, options?.membershipInfo),
    isApproved: options?.isAdmin ? true : !!options?.isApproved,
    isClubAdmin: !!options?.isAdmin,
    joinedAt: Date.now(),
  };
  const membership = await ctx.table("clubMemberships").insert(membershipInfo).get();

  const updatedClub = await updateClubMemberCount(ctx, club, 1);

  return { ...updatedClub, membership };
};

/**
 * Creates club membership information.
 * If membership info is not provided, use user's profile values.
 * @param user User with profile details
 * @param clubId ID of the club to create membership for
 * @param membershipInfo Optional membership details to override profile defaults
 * @returns Complete club membership object with defaults applied
 */
export const createClubMembershipInfo = (
  user: UserDetailsWithProfile,
  clubId: Id<"clubs">,
  membershipInfo?: ClubMembershipInput,
): WithoutSystemFields<ClubMembership> => {
  const { name, gender, skillLevel, preferredPlayStyle } = membershipInfo || {};
  return {
    clubId,
    userId: user._id,
    name: name || `${user.profile.firstName} ${user.profile.lastName}`,
    gender: gender || user.profile.gender,
    skillLevel: skillLevel || user.profile.skillLevel,
    preferredPlayStyle: preferredPlayStyle || user.profile.preferredPlayStyle,
    isApproved: false,
    isClubAdmin: false,
    joinedAt: Date.now(),
  };
};

/**
 * Updates the member count for a club by a given delta.
 * @param ctx Mutation context
 * @param club The club to update
 * @param delta Change in member count (positive or negative)
 * @returns Updated club if member count is updated
 */
export const updateClubMemberCount = async (
  ctx: MutationCtx,
  club: Club,
  delta: number,
): Promise<Club> => {
  const newCount = Math.max(0, club.numMembers + delta);
  if (newCount !== club.numMembers) {
    return await updateClub(ctx, club._id, { numMembers: newCount });
  }
  return club;
};
