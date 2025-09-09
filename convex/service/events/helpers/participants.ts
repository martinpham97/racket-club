import { listAllEventParticipants as dtoListAllEventParticipants } from "@/convex/service/events/database";
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
