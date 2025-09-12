import {
  createEventParticipation,
  deleteEventParticipation,
  listAllEventParticipants as dtoListAllEventParticipants,
} from "@/convex/service/events/database";
import { Event, EventParticipant } from "@/convex/service/events/schemas";
import { MutationCtx } from "@/convex/types";

/**
 * Creates participation records for permanent participants in event timeslots
 * @param ctx Mutation context
 * @param event Event to create permanent participants for
 * @returns Array of created or existing participation records
 */
export const getOrCreatePermanentParticipants = async (
  ctx: MutationCtx,
  event: Event,
): Promise<Array<EventParticipant>> => {
  const existingParticipants = await dtoListAllEventParticipants(ctx, event._id);
  const participants = event.timeslots.flatMap((timeslot) =>
    timeslot.permanentParticipants.map(async (userId) => {
      const existingParticipation = existingParticipants.find((p) => p.userId === userId);
      if (existingParticipation) {
        return existingParticipation;
      }
      return await ctx
        .table("eventParticipants")
        .insert({
          userId,
          joinedAt: event.date,
          eventId: event._id,
          timeslotId: timeslot.id,
          isWaitlisted: false,
          date: event.date,
        })
        .get();
    }),
  );
  return Promise.all(participants);
};

/**
 * Synchronizes permanent participants with event participation records
 * @param ctx Mutation context
 * @param event Event with updated timeslots
 * @param previousEvent Previous event state for comparison
 */
export const syncPermanentParticipants = async (
  ctx: MutationCtx,
  event: Event,
  previousEvent: Event,
): Promise<void> => {
  const existingParticipants = await dtoListAllEventParticipants(ctx, event._id);

  for (const timeslot of event.timeslots) {
    const previousTimeslot = previousEvent.timeslots.find((ts) => ts.id === timeslot.id);
    const previousPermanent = new Set(previousTimeslot?.permanentParticipants || []);
    const currentPermanent = new Set(timeslot.permanentParticipants);

    // Add new permanent participants
    for (const userId of currentPermanent) {
      if (!previousPermanent.has(userId)) {
        const existingParticipation = existingParticipants.find(
          (p) => p.userId === userId && p.timeslotId === timeslot.id,
        );
        if (!existingParticipation) {
          await createEventParticipation(ctx, {
            userId,
            joinedAt: event.date,
            eventId: event._id,
            timeslotId: timeslot.id,
            isWaitlisted: false,
            date: event.date,
          });
        }
      }
    }

    // Remove participants no longer in permanent list
    for (const userId of previousPermanent) {
      if (!currentPermanent.has(userId)) {
        const participation = existingParticipants.find(
          (p) => p.userId === userId && p.timeslotId === timeslot.id,
        );
        if (participation) {
          await deleteEventParticipation(ctx, participation._id);
        }
      }
    }
  }
};
