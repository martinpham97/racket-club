import { Id } from "@/convex/_generated/dataModel";
import { ACTIVITY_TYPES, ActivityType } from "@/convex/constants/activities";
import { Activity } from "@/convex/service/activities/schemas";
import { genId } from "./id";

export const createTestActivity = (
  resourceId?: Id<"clubs"> | Id<"users">,
  createdBy?: Id<"users">,
  overrides?: Partial<Activity>
): Omit<Activity, "_id" | "_creationTime"> => ({
  resourceId: resourceId || genId<"clubs">("clubs"),
  title: "Test Activity",
  description: "Test activity description",
  type: ACTIVITY_TYPES.CLUB_CREATED,
  createdBy: createdBy || genId<"users">("users"),
  createdAt: Date.now(),
  ...overrides,
});

export const createTestActivityRecord = (
  resourceId?: Id<"clubs"> | Id<"users">,
  createdBy?: Id<"users">,
  overrides?: Partial<Activity>
): Activity => ({
  _id: genId<"activities">("activities"),
  _creationTime: Date.now(),
  ...createTestActivity(resourceId, createdBy, overrides),
});