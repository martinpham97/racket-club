import { RATE_LIMIT_REACHED_ERROR_TEMPLATE } from "@/convex/constants/errors";
import { LIMIT_CONFIG } from "@/convex/constants/rateLimit";
import { rateLimiter } from "@/convex/service/utils/rateLimit";
import { RunMutationCtx, RunQueryCtx } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { formatDistance } from "date-fns";
import template from "string-template";

/**
 * Enforces rate limiting for a specific operation and throws an error if limit is exceeded.
 * @param ctx Query/Mutation context for rate limiter
 * @param limitName Name of the rate limit configuration to apply
 * @param key Optional key for rate limiting (defaults to user-based limiting)
 * @throws ConvexError when rate limit is exceeded with retry time information
 */
export const enforceRateLimit = async <
  Ctx extends RunQueryCtx & RunMutationCtx,
  Name extends keyof typeof LIMIT_CONFIG,
>(ctx: Ctx, limitName: Name, key?: string) => {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, limitName as keyof typeof LIMIT_CONFIG, {
    key,
  });
  if (!ok) {
    throw new ConvexError(
      template(RATE_LIMIT_REACHED_ERROR_TEMPLATE, {
        retryAfter: formatDistance(0, retryAfter, { includeSeconds: true }),
      }),
    );
  }
};
