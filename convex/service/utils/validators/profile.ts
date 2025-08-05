import {
  USER_PROFILE_DOB_IN_FUTURE_ERROR,
  USER_PROFILE_DOB_INVALID_ERROR,
} from "@/convex/constants/errors";
import { ConvexError } from "convex/values";

/**
 * Validates date of birth is reasonable (not in future, not too old)
 */
export const validateDateOfBirth = (dob: number) => {
  const now = Date.now();
  const minAge = new Date(now - 120 * 365 * 24 * 60 * 60 * 1000).getTime(); // 120 years ago

  if (dob > now) {
    throw new ConvexError(USER_PROFILE_DOB_IN_FUTURE_ERROR);
  }

  if (dob < minAge) {
    throw new ConvexError(USER_PROFILE_DOB_INVALID_ERROR);
  }
};
