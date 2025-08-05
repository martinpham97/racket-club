import { getPaginationOpts } from "@/convex/service/utils/pagination";
import { describe, expect, it } from "vitest";

describe("getPaginationOpts", () => {
  it("returns defaults when no options provided", () => {
    const result = getPaginationOpts();

    expect(result).toEqual({
      cursor: null,
      numItems: 20,
    });
  });

  it("returns defaults when undefined provided", () => {
    const result = getPaginationOpts(undefined);

    expect(result).toEqual({
      cursor: null,
      numItems: 20,
    });
  });

  it("uses provided cursor and numItems", () => {
    const result = getPaginationOpts({
      cursor: "test-cursor",
      numItems: 10,
    });

    expect(result).toEqual({
      cursor: "test-cursor",
      numItems: 10,
    });
  });

  it("uses default numItems when only cursor provided", () => {
    const result = getPaginationOpts({
      cursor: "test-cursor",
    });

    expect(result).toEqual({
      cursor: "test-cursor",
      numItems: 20,
    });
  });

  it("uses default cursor when only numItems provided", () => {
    const result = getPaginationOpts({
      numItems: 5,
    });

    expect(result).toEqual({
      cursor: null,
      numItems: 5,
    });
  });
});
