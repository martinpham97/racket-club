import { getChangeMetadata } from "@/convex/service/utils/metadata";
import { describe, expect, it } from "vitest";

describe("getChangeMetadata", () => {
  it("returns empty array when no changes", () => {
    const original = { name: "Test", age: 25 };
    const updates = {};

    const result = getChangeMetadata(original, updates);

    expect(result).toEqual([]);
  });

  it("returns metadata for changed fields", () => {
    const original = { name: "John", age: 25, active: true };
    const updates = { name: "Jane", age: 30 };

    const result = getChangeMetadata(original, updates);

    expect(result).toEqual([
      {
        fieldChanged: "name",
        previousValue: "John",
        newValue: "Jane",
      },
      {
        fieldChanged: "age",
        previousValue: "25",
        newValue: "30",
      },
    ]);
  });

  it("ignores undefined values", () => {
    const original = { name: "John", age: 25 };
    const updates = { name: "Jane", age: undefined };

    const result = getChangeMetadata(original, updates);

    expect(result).toEqual([
      {
        fieldChanged: "name",
        previousValue: "John",
        newValue: "Jane",
      },
    ]);
  });

  it("ignores unchanged values", () => {
    const original = { name: "John", age: 25 };
    const updates = { name: "John", age: 30 };

    const result = getChangeMetadata(original, updates);

    expect(result).toEqual([
      {
        fieldChanged: "age",
        previousValue: "25",
        newValue: "30",
      },
    ]);
  });

  it("converts values to strings", () => {
    const original = { count: 10, active: true, score: null };
    const updates = { count: 20, active: false, score: 0 };

    const result = getChangeMetadata(original, updates);

    expect(result).toEqual([
      {
        fieldChanged: "count",
        previousValue: "10",
        newValue: "20",
      },
      {
        fieldChanged: "active",
        previousValue: "true",
        newValue: "false",
      },
      {
        fieldChanged: "score",
        previousValue: "null",
        newValue: "0",
      },
    ]);
  });

  it("handles nested objects as strings", () => {
    const original = { config: { theme: "dark" } };
    const updates = { config: { theme: "light" } };

    const result = getChangeMetadata(original, updates);

    expect(result).toEqual([
      {
        fieldChanged: "config",
        previousValue: "[object Object]",
        newValue: "[object Object]",
      },
    ]);
  });
});
