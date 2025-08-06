import { AuthenticatedWithProfileCtx } from "@/convex/service/utils/functions";
import { createMockCtx } from "@/test-utils/mocks/ctx";
import { createTestActivity, createTestActivityRecord } from "@/test-utils/samples/activities";
import { genId } from "@/test-utils/samples/id";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivity,
  deleteActivitiesForResource,
  getActivity,
  listActivitiesForResource,
} from "../database";

describe("Activity Database Service", () => {
  let mockCtx: AuthenticatedWithProfileCtx;

  beforeEach(() => {
    mockCtx = createMockCtx();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getActivity", () => {
    it("returns activity when found", async () => {
      const activityId = genId<"activities">("activities");
      const activity = createTestActivityRecord();

      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(activity);

      const result = await getActivity(mockCtx, activityId);

      expect(result).toEqual(activity);
      expect(mockCtx.db.get).toHaveBeenCalledWith(activityId);
    });

    it("returns null when not found", async () => {
      const activityId = genId<"activities">("activities");

      vi.mocked(mockCtx.db.get).mockResolvedValueOnce(null);

      const result = await getActivity(mockCtx, activityId);

      expect(result).toBeNull();
    });
  });

  describe("listActivitiesForResource", () => {
    it("returns paginated activities for club", async () => {
      const clubId = genId<"clubs">("clubs");
      const paginationOpts = { cursor: null, numItems: 10 };
      const activities = [createTestActivityRecord(), createTestActivityRecord()];
      const paginatedResult = { page: activities, isDone: true, continueCursor: null };

      const mockQuery = {
        withIndex: vi.fn(() => ({
          order: vi.fn(() => ({
            paginate: vi.fn().mockResolvedValueOnce(paginatedResult),
          })),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );

      const result = await listActivitiesForResource(mockCtx, clubId, paginationOpts);

      expect(result).toEqual(paginatedResult);
      expect(mockCtx.db.query).toHaveBeenCalledWith("activities");
    });
  });

  describe("createActivity", () => {
    it("inserts new activity", async () => {
      const activity = createTestActivity();
      const activityId = genId<"activities">("activities");

      vi.mocked(mockCtx.db.insert).mockResolvedValueOnce(activityId);

      const result = await createActivity(mockCtx, activity);

      expect(result).toBe(activityId);
      expect(mockCtx.db.insert).toHaveBeenCalledWith("activities", activity);
    });
  });

  describe("deleteActivitiesForResource", () => {
    it("removes all activities for resource", async () => {
      const resourceId = genId<"clubs">("clubs");
      const activities = [createTestActivityRecord(), createTestActivityRecord()];

      const mockQuery = {
        withIndex: vi.fn(() => ({
          order: vi.fn(() => ({
            collect: vi.fn().mockResolvedValueOnce(activities),
          })),
        })),
      };
      vi.mocked(mockCtx.db.query).mockReturnValueOnce(
        mockQuery as unknown as ReturnType<typeof mockCtx.db.query>,
      );
      vi.mocked(mockCtx.db.delete).mockResolvedValue(undefined);

      await deleteActivitiesForResource(mockCtx, resourceId);

      expect(mockCtx.db.query).toHaveBeenCalledWith("activities");
      expect(mockCtx.db.delete).toHaveBeenCalledTimes(2);
    });
  });
});
