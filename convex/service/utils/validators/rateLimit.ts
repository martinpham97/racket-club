import { RunMutationCtx } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { formatDistance } from "date-fns";
import template from "string-template";
import { RATE_LIMIT_REACHED_ERROR_TEMPLATE } from "../../../constants/errors";
import { LIMIT_CONFIG } from "../../../constants/rateLimit";
import { rateLimiter } from "../rateLimit";

export async function enforceRateLimit<
  Ctx extends RunMutationCtx,
  Name extends keyof typeof LIMIT_CONFIG,
>(ctx: Ctx, limitName: Name, key?: string) {
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
}
