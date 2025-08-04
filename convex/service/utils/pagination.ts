import { PaginationOptions } from "convex/server";

/**
 * Creates pagination options with default values.
 * By default, a maximum of `20` items are fetched.
 * @param paginationOpts Optional partial pagination options
 * @returns Complete pagination options with defaults (cursor: null, numItems: 20)
 */
export const getPaginationOpts = (paginationOpts?: Partial<PaginationOptions>) => {
  return {
    cursor: paginationOpts?.cursor ?? null,
    numItems: paginationOpts?.numItems ?? 20,
  };
};
