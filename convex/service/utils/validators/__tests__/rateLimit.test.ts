import { MutationCtx } from "@/convex/_generated/server";
import { rateLimiter } from "@/convex/service/utils/rateLimit";
import { enforceRateLimit } from "@/convex/service/utils/validators/rateLimit";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../rateLimit");
vi.mock("date-fns", () => ({
  formatDistance: vi.fn(() => "5 minutes"),
}));
vi.mock("string-template", () => ({
  default: vi.fn((template, data) => template.replace("{retryAfter}", data.retryAfter)),
}));

describe("enforceRateLimit", () => {
  const mockCtx: MutationCtx = createMockCtx();

  it("passes when rate limit is not exceeded", async () => {
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfter: 0,
    });

    await expect(enforceRateLimit(mockCtx, "profileUpdate")).resolves.toBeUndefined();
  });

  it("throws error when rate limit is exceeded", async () => {
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: false,
      retryAfter: 300000, // 5 minutes
    });

    await expect(enforceRateLimit(mockCtx, "profileUpdate")).rejects.toThrow(
      new ConvexError("Looks like you're sending too many requests. Try again after 5 minutes."),
    );
  });

  it("passes custom key to rate limiter", async () => {
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfter: 0,
    });

    await enforceRateLimit(mockCtx, "profileUpdate", "custom-key");

    expect(rateLimiter.limit).toHaveBeenCalledWith(mockCtx, "profileUpdate", {
      key: "custom-key",
    });
  });
});
