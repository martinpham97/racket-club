import { PaginationOptions } from "convex/server";
import z from "zod";

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

/**
 * Creates a Zod schema for paginated results
 * @param itemSchema - Zod schema for individual items in the page
 * @returns Zod schema for paginated response with page array, isDone flag, and continueCursor
 */
export const paginatedResult = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    page: z.array(itemSchema),
    isDone: z.boolean(),
    continueCursor: z.string(),
  });
