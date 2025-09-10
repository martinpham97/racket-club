import { internal } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { EVENT_STATUS, NUM_DAYS_GENERATE_EVENTS_IN_ADVANCE } from "@/convex/constants/events";
import { EventSeries } from "@/convex/service/events/schemas";
import { getStartOfDayInTimezone, getUtcTimestampForDate } from "@/convex/service/utils/time";
import { MutationCtx } from "@/convex/types";
import { addDays, subDays } from "date-fns";
import { generateUpcomingEventDates } from "./dates";

/**
 * Schedules event series deactivation
 * @param ctx Mutation context
 * @param seriesId ID of the event series
 * @param scheduledAt Timestamp when deactivation should execute
 */
export const scheduleEventSeriesDeactivation = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  scheduledAt: number,
): Promise<void> => {
  const series = await ctx.table("eventSeries").getX(seriesId);
  const existingSchedule = await series.edge("onSeriesEndFunction");

  if (existingSchedule) {
    return;
  }

  const onSeriesEndFunctionId = await ctx.scheduler.runAt(
    scheduledAt,
    internal.service.events.functions._deactivateEventSeries,
    { eventSeriesId: seriesId },
  );

  await series.patch({ onSeriesEndFunctionId });
};

/**
 * Schedules event status transitions
 * @param ctx Mutation context
 * @param eventId ID of the event
 * @param startTime Timestamp when event should start
 * @param endTime Timestamp when event should complete
 */
export const scheduleEventStatusTransitions = async (
  ctx: MutationCtx,
  eventId: Id<"events">,
  startTime: number,
  endTime: number,
): Promise<void> => {
  const event = await ctx.table("events").getX(eventId);

  // Schedule start transition
  const existingStartSchedule = await event.edge("onEventStartFunction");
  if (!existingStartSchedule) {
    const onEventStartFunctionId = await ctx.scheduler.runAt(
      startTime,
      internal.service.events.functions._updateEventStatus,
      { eventId, status: EVENT_STATUS.IN_PROGRESS },
    );
    await event.patch({ onEventStartFunctionId });
  }

  // Schedule completion transition
  const existingCompletionSchedule = await event.edge("onEventEndFunction");
  if (!existingCompletionSchedule) {
    const onEventEndFunctionId = await ctx.scheduler.runAt(
      endTime,
      internal.service.events.functions._updateEventStatus,
      { eventId, status: EVENT_STATUS.COMPLETED },
    );
    await event.patch({ onEventEndFunctionId });
  }
};

/**
 * Schedules status transitions for an event (start and completion)
 * @param ctx Mutation context
 * @param series Event series containing timing information
 * @param eventId ID of the event to schedule transitions for
 * @param date Date of the event
 */
export const getOrScheduleEventStatusTransitions = async (
  ctx: MutationCtx,
  series: EventSeries,
  eventId: Id<"events">,
  date: number,
): Promise<void> => {
  const startTime = getUtcTimestampForDate(series.startTime, series.location.timezone, date);
  const endTime = getUtcTimestampForDate(series.endTime, series.location.timezone, date);
  await scheduleEventStatusTransitions(ctx, eventId, startTime, endTime);
};

/**
 * Schedules automatic deactivation of an event series at its end date
 * @param ctx Mutation context
 * @param series Event series data containing schedule information
 */
export const scheduleEventSeriesDeactivationAtEndDate = async (
  ctx: MutationCtx,
  series: EventSeries,
): Promise<void> => {
  const endDateInTimezone = getStartOfDayInTimezone(
    series.schedule.endDate,
    series.location.timezone,
  );
  const deactivationDate = endDateInTimezone.getTime();
  await scheduleEventSeriesDeactivation(ctx, series._id, deactivationDate);
};

/**
 * Activates an event series by scheduling deactivation and generating initial events
 * @param ctx Mutation context
 * @param eventSeries Event series data
 */
export const activateEventSeries = async (
  ctx: MutationCtx,
  eventSeries: EventSeries,
): Promise<void> => {
  await scheduleEventSeriesDeactivationAtEndDate(ctx, eventSeries);
  const startDate = Math.max(Date.now(), eventSeries.schedule.startDate);
  const endDate = eventSeries.schedule.endDate;
  await ctx.runMutation(internal.service.events.functions._generateEventsForSeries, {
    eventSeriesId: eventSeries._id,
    range: { startDate, endDate },
    scheduleNextBatch: true,
  });
};

/**
 * Schedules the next batch of event generation for a series
 * @param ctx Mutation context
 * @param seriesId ID of the event series
 * @param currentGeneratedDates Array of timestamps for currently generated events
 * @returns ID of the scheduled function or null if no next batch is needed
 */
export const scheduleNextEventGeneration = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  currentGeneratedDates: number[],
): Promise<Id<"_scheduled_functions"> | null> => {
  if (currentGeneratedDates.length === 0) {
    return null;
  }

  const series = await ctx.table("eventSeries").getX(seriesId);
  const lastGeneratedDate = Math.max(...currentGeneratedDates);
  const nextDates = generateUpcomingEventDates(
    series,
    addDays(lastGeneratedDate, 1).getTime(),
    series.schedule.endDate,
  );

  if (nextDates.length > 0) {
    const nextDate = Math.min(...nextDates);
    const scheduleDate = subDays(nextDate, NUM_DAYS_GENERATE_EVENTS_IN_ADVANCE).getTime();

    const onNextBatchFunctionId = await ctx.scheduler.runAt(
      scheduleDate,
      internal.service.events.functions._generateEventsForSeries,
      {
        eventSeriesId: seriesId,
        range: {
          startDate: nextDate,
          endDate: series.schedule.endDate,
        },
        scheduleNextBatch: true,
      },
    );
    await series.patch({ onNextBatchFunctionId });

    return onNextBatchFunctionId;
  }

  return null;
};

/**
 * Gets the status of a scheduled function via edge
 * @param ctx Mutation context
 * @param seriesId ID of the event series
 * @returns Status of the deactivation schedule or null if not found
 */
export const getEventSeriesDeactivationStatus = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
): Promise<string | null> => {
  const series = await ctx.table("eventSeries").getX(seriesId);
  const schedule = await series.edge("onSeriesEndFunction");
  return schedule?.state.kind ?? null;
};

/**
 * Gets the status of event scheduled transitions
 * @param ctx Mutation context
 * @param eventId ID of the event
 * @returns Object with start and completion schedule statuses
 */
export const getEventScheduleStatuses = async (
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<{ onEventStart: string | null; onEventEnd: string | null }> => {
  const event = await ctx.table("events").getX(eventId);
  const onEventStart = await event.edge("onEventStartFunction");
  const onEventEnd = await event.edge("onEventEndFunction");

  return {
    onEventStart: onEventStart?.state.kind ?? null,
    onEventEnd: onEventEnd?.state.kind ?? null,
  };
};
