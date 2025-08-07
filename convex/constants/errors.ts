export const AUTH_PROVIDER_NO_EMAIL_ERROR =
  "Unable to login due to no email provided by the authentication provider.";

export const AUTH_ACCESS_DENIED_ERROR = "You do not have access to perform this action.";

export const AUTH_UNAUTHENTICATED_ERROR = "You must be signed in to perform this action.";

export const USER_PROFILE_REQUIRED_ERROR =
  "Profile not found! Please create a profile to continue.";

export const USER_PROFILE_ALREADY_EXISTS_ERROR = "Profile already exists.";

export const USER_PROFILE_DOB_IN_FUTURE_ERROR = "Date of birth cannot be in the future.";

export const USER_PROFILE_DOB_INVALID_ERROR = "Invalid date of birth.";

export const RATE_LIMIT_REACHED_ERROR_TEMPLATE =
  "Looks like you're sending too many requests. Try again after {retryAfter}.";

export const CLUB_NOT_FOUND_ERROR = "This club does not exist.";

export const CLUB_MEMBERSHIP_ALREADY_EXISTS_ERROR = "You are already a member of this club.";

export const CLUB_MEMBERSHIP_REQUIRED_ERROR =
  "You must be a member of this club to perform this action.";

export const CLUB_MEMBERSHIP_NOT_FOUND_ERROR = "This club member does not exist.";

export const CLUB_MEMBERSHIP_CANNOT_REMOVE_OWNER_ERROR = "You cannot remove the club owner.";

export const CLUB_MEMBERSHIPS_MUST_BE_FROM_SAME_CLUB_ERROR =
  "All memberships must belong to the same club.";

export const CLUB_FULL_ERROR = "You cannot join this club. This club has reached its max capacity.";

export const CLUB_PUBLIC_UNAPPROVED_ERROR =
  "You cannot join this club. This public club has not yet been approved.";

export const CLUB_OWNER_CANNOT_LEAVE_ERROR =
  "You cannot leave this club as you are the club owner.";

export const CLUB_PUBLIC_SAME_NAME_ALREADY_EXISTS_ERROR =
  "A public club with the same name already exists. Please consider renaming your club or create a private club.";

export const CLUB_USER_BANNED_ERROR = "You are banned from this club.";

export const CLUB_USER_NOT_BANNED_ERROR = "This user is not banned from the club.";

export const CLUB_CANNOT_BAN_OWNER_ERROR = "You cannot ban the club owner.";

export const CLUB_CANNOT_BAN_SELF_ERROR = "You cannot ban yourself.";
