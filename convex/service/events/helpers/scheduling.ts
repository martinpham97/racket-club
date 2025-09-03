import { internal } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MutationCtx } from "@/convex/_generated/server";
import { ACTIVITY_TYPES, ActivityType } from "@/convex/constants/activities";
import { EVENT_STATUS, MAX_EVENT_GENERATION_DAYS } from "@/convex/constants/events";
import {
  createActivity,
  getScheduledActivityForResource,
} from "@/convex/service/activities/database";
import { getStartOfDayInTimezone, getUtcTimestampForDate } from "@/convex/service/utils/time";
import { getOrThrow } from "convex-helpers/server/relationships";
import { addDays, isFuture, subDays } from "date-fns";
import { ActivityMetadata } from "../../activities/schemas";
import { EventSeries } from "../schemas";

/**
 * Creates or retrieves a scheduled activity for event transitions
 * @param ctx Mutation context
 * @param type Activity type for the transition
 * @param resourceId ID of the event series or event
 * @param scheduledAt Timestamp when the activity should execute
 * @returns Activity ID if created/found, null otherwise
 */
export const getOrCreateEventScheduledTransitionActivity = async (
  ctx: MutationCtx,
  type: ActivityType,
  resourceId: Id<"eventSeries"> | Id<"events">,
  scheduledAt: number,
): Promise<Id<"activities"> | null> => {
  const existingTransitionActivity = await getScheduledActivityForResource(
    ctx,
    resourceId,
    scheduledAt,
    type,
  );

  if (existingTransitionActivity) {
    return existingTransitionActivity._id;
  }

  let scheduledFunctionId: Id<"_scheduled_functions"> | undefined;
  const metadata: ActivityMetadata = [];

  switch (type) {
    case ACTIVITY_TYPES.EVENT_SERIES_DEACTIVATION_SCHEDULED:
      scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledAt,
        internal.service.events.functions._deactivateEventSeries,
        { eventSeriesId: resourceId as Id<"eventSeries"> },
      );
      metadata.push({
        fieldChanged: "isActive",
        newValue: "false",
      });
      break;
    case ACTIVITY_TYPES.EVENT_IN_PROGRESS_SCHEDULED:
      scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledAt,
        internal.service.events.functions._updateEventStatus,
        {
          eventId: resourceId as Id<"events">,
          status: EVENT_STATUS.IN_PROGRESS,
        },
      );
      metadata.push({
        fieldChanged: "status",
        newValue: EVENT_STATUS.IN_PROGRESS,
      });
      break;
    case ACTIVITY_TYPES.EVENT_COMPLETED_SCHEDULED:
      scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledAt,
        internal.service.events.functions._updateEventStatus,
        {
          eventId: resourceId as Id<"events">,
          status: EVENT_STATUS.COMPLETED,
        },
      );
      metadata.push({
        fieldChanged: "status",
        newValue: EVENT_STATUS.COMPLETED,
      });
      break;
    default:
      break;
  }

  if (scheduledFunctionId) {
    return await createActivity(ctx, {
      type,
      resourceId,
      relatedId: scheduledFunctionId,
      scheduledAt,
      metadata,
    });
  }

  return null;
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
  await getOrCreateEventScheduledTransitionActivity(
    ctx,
    ACTIVITY_TYPES.EVENT_IN_PROGRESS_SCHEDULED,
    eventId,
    startTime,
  );
  await getOrCreateEventScheduledTransitionActivity(
    ctx,
    ACTIVITY_TYPES.EVENT_COMPLETED_SCHEDULED,
    eventId,
    endTime,
  );
};

/**
 * Schedules automatic deactivation of an event series at its end date
 * @param ctx Mutation context
 * @param seriesId ID of the event series to deactivate
 * @param input Event series data containing schedule information
 */
export const scheduleEventSeriesDeactivation = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  input: EventSeries,
): Promise<void> => {
  const endDateInTimezone = getStartOfDayInTimezone(
    input.schedule.endDate,
    input.location.timezone,
  );
  const deactivationDate = endDateInTimezone.getTime();
  await getOrCreateEventScheduledTransitionActivity(
    ctx,
    ACTIVITY_TYPES.EVENT_SERIES_DEACTIVATION_SCHEDULED,
    seriesId,
    deactivationDate,
  );
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
  await scheduleEventSeriesDeactivation(ctx, eventSeries._id, eventSeries);
  const startDate = Math.max(Date.now(), eventSeries.schedule.startDate);
  const endDate = eventSeries.schedule.endDate;
  const { events } = await ctx.runMutation(
    internal.service.events.functions._generateEventsForSeries,
    {
      eventSeriesId: eventSeries._id,
      range: { startDate, endDate },
    },
  );
  await scheduleNextEventGeneration(
    ctx,
    eventSeries._id,
    events.map((e) => e.date),
  );
};

/**
 * Schedules the next batch of event generation for a series
 * @param ctx Mutation context
 * @param seriesId ID of the event series
 * @param currentGeneratedDates Array of timestamps for currently generated events
 */
export const scheduleNextEventGeneration = async (
  ctx: MutationCtx,
  seriesId: Id<"eventSeries">,
  currentGeneratedDates: number[],
): Promise<void> => {
  if (currentGeneratedDates.length === 0) {
    return;
  }

  const series = await getOrThrow(ctx, seriesId);
  const lastGeneratedDate = Math.max(...currentGeneratedDates);
  const scheduleDate = subDays(lastGeneratedDate, MAX_EVENT_GENERATION_DAYS).getTime();

  if (isFuture(scheduleDate) && scheduleDate < series.schedule.endDate) {
    await ctx.scheduler.runAt(
      scheduleDate,
      internal.service.events.functions._generateEventsForSeries,
      {
        eventSeriesId: seriesId,
        range: {
          startDate: addDays(lastGeneratedDate, 1).getTime(),
          endDate: series.schedule.endDate,
        },
      },
    );
  }
};
