import { Id } from "@/convex/_generated/dataModel";
import { ScheduledTransition, TransitionDetails } from "@/convex/service/transitions/schemas";
import { genId } from "./id";

/**
 * Creates a test transition details object
 */
export const createTestTransitionDetails = (
  overrides: Partial<TransitionDetails> = {},
): TransitionDetails => ({
  previousValue: "pending",
  newValue: "completed",
  fieldChanged: "status",
  ...overrides,
});

/**
 * Creates a test scheduled transition record
 */
export const createTestScheduledTransition = (
  createdBy: Id<"users">,
  overrides: Partial<Omit<ScheduledTransition, "_id" | "_creationTime">> = {},
): Omit<ScheduledTransition, "_id" | "_creationTime"> => ({
  tableName: "events",
  recordId: genId("events"),
  scheduledAt: Date.now() + 60000, // 1 minute from now
  status: "pending",
  transitionDetails: createTestTransitionDetails(),
  functionName: "updateEventStatus",
  createdBy,
  createdAt: Date.now(),
  retryCount: 0,
  maxRetries: 3,
  ...overrides,
});

/**
 * Creates a test scheduled transition record with system fields
 */
export const createTestScheduledTransitionRecord = (
  createdBy: Id<"users">,
  overrides: Partial<Omit<ScheduledTransition, "_id" | "_creationTime">> = {},
): ScheduledTransition => ({
  _id: genId("scheduledTransitions"),
  _creationTime: Date.now(),
  ...createTestScheduledTransition(createdBy, overrides),
});