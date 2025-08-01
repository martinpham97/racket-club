import { components } from "@/convex/_generated/api";
import { LIMIT_CONFIG } from "@/convex/constants/rateLimit";
import { RateLimiter } from "@convex-dev/rate-limiter";

export const rateLimiter = new RateLimiter(components.rateLimiter, LIMIT_CONFIG);
