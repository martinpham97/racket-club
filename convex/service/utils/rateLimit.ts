import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../../_generated/api";
import { LIMIT_CONFIG } from "../../constants/rateLimit";

export const rateLimiter = new RateLimiter(components.rateLimiter, LIMIT_CONFIG);
