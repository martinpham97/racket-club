import {
  USER_PROFILE_DOB_IN_FUTURE_ERROR,
  USER_PROFILE_DOB_INVALID_ERROR,
} from "@/convex/constants/errors";
import { validateDateOfBirth } from "@/convex/service/utils/validators/profile";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

describe("Profile Validators", () => {
  describe("validateDateOfBirth", () => {
    it("allows valid date of birth", () => {
      const twentyYearsAgo = Date.now() - 20 * 365 * 24 * 60 * 60 * 1000;
      expect(() => validateDateOfBirth(twentyYearsAgo)).not.toThrow();
    });

    it("throws when date is in future", () => {
      const futureDate = Date.now() + 24 * 60 * 60 * 1000;
      expect(() => validateDateOfBirth(futureDate)).toThrow(
        new ConvexError(USER_PROFILE_DOB_IN_FUTURE_ERROR),
      );
    });

    it("throws when date is too old", () => {
      const tooOld = Date.now() - 130 * 365 * 24 * 60 * 60 * 1000;
      expect(() => validateDateOfBirth(tooOld)).toThrow(
        new ConvexError(USER_PROFILE_DOB_INVALID_ERROR),
      );
    });
  });
});
