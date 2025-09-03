import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx, QueryCtx } from "@/convex/_generated/server";
import {
  EVENT_TIMESLOT_FULL_ERROR,
  EVENT_TIMESLOT_INVALID_ID_ERROR,
} from "@/convex/constants/errors";
import { ConvexError } from "convex/values";
import { listAllEventParticipants, listEventParticipationsForUser } from "../database";
import { Event, EventParticipant, Timeslot } from "../schemas";

/**
 * Retrieves a timeslot by ID or throws an error if not found
 * @param event Event containing timeslots
 * @param timeslotId ID of the timeslot to retrieve
 * @returns The timeslot if found
 * @throws {ConvexError} EVENT_TIMESLOT_INVALID_ID_ERROR when timeslot not found
 */
export const getTimeslotOrThrow = (event: Event, timeslotId: string): Timeslot => {
  const timeslot = event.timeslots.find((ts) => ts.id === timeslotId);
  if (!timeslot) {
    throw new ConvexError(EVENT_TIMESLOT_INVALID_ID_ERROR);
  }
  return timeslot;
};

/**
 * Determines if a user should be waitlisted for a timeslot
 * @param timeslot Timeslot to check capacity for
 * @returns true if user should be waitlisted, false otherwise
 * @throws {ConvexError} EVENT_TIMESLOT_FULL_ERROR when timeslot and waitlist are full
 */
export const shouldUserBeWaitlisted = (timeslot: Timeslot): boolean => {
  if (timeslot.numParticipants >= timeslot.maxParticipants) {
    if (timeslot.numWaitlisted >= timeslot.maxWaitlist) {
      throw new ConvexError(EVENT_TIMESLOT_FULL_ERROR);
    }
    return true;
  }
  return false;
};

/**
 * Finds a user's participation record for a specific timeslot
 * @param ctx Query context
 * @param eventId ID of the event
 * @param userId ID of the user
 * @param timeslotId ID of the timeslot
 * @returns User's participation record if found, undefined otherwise
 */
export const findUserParticipationByTimeslotId = async (
  ctx: QueryCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
  timeslotId: string,
): Promise<EventParticipant | undefined> => {
  const participations = await listEventParticipationsForUser(ctx, eventId, userId);
  return participations.find((p) => p.timeslotId === timeslotId);
};

/**
 * Promotes the earliest waitlisted participant to active status
 * @param ctx Mutation context
 * @param eventId ID of the event
 * @param timeslotId ID of the timeslot
 * @param timeslot Timeslot data for capacity checking
 */
export const promoteWaitlistedParticipant = async (
  ctx: MutationCtx,
  eventId: Id<"events">,
  timeslotId: string,
  timeslot: Timeslot,
): Promise<void> => {
  const participants = await listAllEventParticipants(ctx, eventId);
  const timeslotParticipants = participants.filter((p) => p.timeslotId === timeslotId);

  if (timeslotParticipants.length < timeslot.maxParticipants) {
    const waitlisted = timeslotParticipants.filter((p) => p.isWaitlisted);
    if (waitlisted.length > 0) {
      const nextParticipant = waitlisted.reduce((earliest, current) =>
        current.joinedAt < earliest.joinedAt ? current : earliest,
      );
      await ctx.db.patch(nextParticipant._id, { isWaitlisted: false, joinedAt: Date.now() });
    }
  }
};
