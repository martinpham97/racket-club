import { getPaginationOpts, paginatedResult } from "@/convex/service/utils/pagination";
import { describe, expect, it } from "vitest";
import z from "zod";

describe("Pagination Utils", () => {
  describe("getPaginationOpts", () => {
    it("returns default values when no options provided", () => {
      const result = getPaginationOpts();

      expect(result).toEqual({
        cursor: null,
        numItems: 20,
      });
    });

    it("uses provided cursor and numItems", () => {
      const result = getPaginationOpts({
        cursor: "test-cursor",
        numItems: 50,
      });

      expect(result).toEqual({
        cursor: "test-cursor",
        numItems: 50,
      });
    });

    it("uses defaults for missing properties", () => {
      const result = getPaginationOpts({ cursor: "test-cursor" });

      expect(result).toEqual({
        cursor: "test-cursor",
        numItems: 20,
      });
    });
  });

  describe("paginatedResult", () => {
    it("creates correct schema for string items", () => {
      const schema = paginatedResult(z.string());

      const validData = {
        page: ["item1", "item2"],
        isDone: true,
        continueCursor: "cursor123",
      };

      expect(() => schema.parse(validData)).not.toThrow();
      expect(schema.parse(validData)).toEqual(validData);
    });

    it("creates correct schema for object items", () => {
      const itemSchema = z.object({
        id: z.string(),
        name: z.string(),
      });
      const schema = paginatedResult(itemSchema);

      const validData = {
        page: [
          { id: "1", name: "Item 1" },
          { id: "2", name: "Item 2" },
        ],
        isDone: false,
        continueCursor: "next-page",
      };

      expect(() => schema.parse(validData)).not.toThrow();
      expect(schema.parse(validData)).toEqual(validData);
    });

    it("validates required fields", () => {
      const schema = paginatedResult(z.string());

      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({ page: [] })).toThrow();
      expect(() => schema.parse({ page: [], isDone: true })).toThrow();
    });

    it("validates page array items", () => {
      const schema = paginatedResult(z.number());

      const invalidData = {
        page: ["not-a-number"],
        isDone: true,
        continueCursor: "cursor",
      };

      expect(() => schema.parse(invalidData)).toThrow();
    });

    it("validates boolean isDone field", () => {
      const schema = paginatedResult(z.string());

      const invalidData = {
        page: [],
        isDone: "not-boolean",
        continueCursor: "cursor",
      };

      expect(() => schema.parse(invalidData)).toThrow();
    });

    it("validates string continueCursor field", () => {
      const schema = paginatedResult(z.string());

      const invalidData = {
        page: [],
        isDone: true,
        continueCursor: 123,
      };

      expect(() => schema.parse(invalidData)).toThrow();
    });
  });
});
