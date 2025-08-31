import { DataModel } from "@/convex/_generated/dataModel";
import {
  EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
  TIME_FORMAT_ERROR,
  TIMESLOT_DURATION_MORE_THAN_24_HOURS_ERROR,
} from "@/convex/constants/errors";
import {
  DISCOUNT_TYPE,
  EVENT_RECURRENCE,
  EVENT_STATUS,
  EVENT_TYPE,
  EVENT_VISIBILITY,
  FEE_TYPE,
  MAX_DISCOUNT_DESCRIPTION_LENGTH,
  MAX_DISCOUNTS,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_NAME_LENGTH,
  MAX_GRACE_TIME_HOURS,
  MAX_PARTICIPANTS,
  MAX_TIMESLOT_NAME_LENGTH,
  MAX_WAITLIST,
  MIN_GRACE_TIME_HOURS,
  MIN_PARTICIPANTS,
  MIN_WAITLIST,
  PAYMENT_TYPE,
  PENALTY_TYPE,
  TIME_FORMAT_REGEX,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable, DocumentByName } from "convex/server";
import z from "zod";

const locationSchema = z.object({
  name: z.string(),
  placeId: z.string(),
  address: z.string(),
  timezone: z.string().refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid timezone." },
  ),
});

const levelRangeSchema = z
  .object({
    min: z.number().min(0).max(5),
    max: z.number().min(0).max(5),
  })
  .refine((data) => data.min <= data.max, {
    message: "Minimum skill level must be less than or equal to maximum skill level.",
  });

const scheduleSchema = z.object({
  startDate: z.number().optional(),
  endDate: z.number().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
});

const discountSchema = z.object({
  description: z.string().max(MAX_DISCOUNT_DESCRIPTION_LENGTH).optional(),
  type: z.enum([
    DISCOUNT_TYPE.USER,
    DISCOUNT_TYPE.GENDER,
    DISCOUNT_TYPE.SKILL_LEVEL,
    DISCOUNT_TYPE.CLUB_MEMBER,
  ]),
  value: z.number().min(0).max(100),
});

const graceTimeSchema = z.object({
  hours: z.number().min(MIN_GRACE_TIME_HOURS).max(MAX_GRACE_TIME_HOURS),
  penaltyType: z.enum([PENALTY_TYPE.FIXED, PENALTY_TYPE.DEFAULT_FEE]),
  penaltyAmount: z.number().min(0),
});

const baseTimeslotSchema = z.object({
  name: z.string().max(MAX_TIMESLOT_NAME_LENGTH).optional(),
  type: z.enum([TIMESLOT_TYPE.DURATION, TIMESLOT_TYPE.START_END]),
  startTime: z.string().regex(TIME_FORMAT_REGEX, TIME_FORMAT_ERROR).optional(),
  endTime: z.string().regex(TIME_FORMAT_REGEX, TIME_FORMAT_ERROR).optional(),
  duration: z
    .number()
    .max(24 * 60, TIMESLOT_DURATION_MORE_THAN_24_HOURS_ERROR)
    .optional(),
  feeType: z.enum([FEE_TYPE.SPLIT, FEE_TYPE.FIXED]),
  fee: z.number().min(0).optional(),
  discounts: z.array(discountSchema).max(MAX_DISCOUNTS).optional(),
  maxParticipants: z
    .number()
    .min(MIN_PARTICIPANTS, EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR)
    .max(MAX_PARTICIPANTS, EVENT_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR),
  maxWaitlist: z.number().min(MIN_WAITLIST).max(MAX_WAITLIST),
  permanentParticipants: z.array(zid("users")).max(MAX_PARTICIPANTS),
});

const timeslotInputSchema = baseTimeslotSchema;

const timeslotSchema = baseTimeslotSchema.extend({
  id: z.string(),
  numParticipants: z.number(),
  numWaitlisted: z.number(),
});

export const eventVisibilitySchema = z.enum([
  EVENT_VISIBILITY.MEMBERS_ONLY,
  EVENT_VISIBILITY.PUBLIC,
]);

export const baseEventSchema = z.object({
  clubId: zid("clubs"),
  name: z.string().max(MAX_EVENT_NAME_LENGTH),
  description: z.string().max(MAX_EVENT_DESCRIPTION_LENGTH).optional(),
  location: locationSchema,
  logo: z.string().optional(),
  banner: z.string().optional(),
  type: z.enum([EVENT_TYPE.SOCIAL, EVENT_TYPE.TRAINING]),
  startTime: z.string().regex(TIME_FORMAT_REGEX, TIME_FORMAT_ERROR),
  endTime: z.string().regex(TIME_FORMAT_REGEX, TIME_FORMAT_ERROR),
  timeslots: z.array(timeslotInputSchema).min(1),
  paymentType: z.enum([PAYMENT_TYPE.CASH]),
  visibility: eventVisibilitySchema,
  graceTime: graceTimeSchema.optional(),
  levelRange: levelRangeSchema,
  createdAt: z.number(),
  modifiedAt: z.number().optional(),
  createdBy: zid("users"),
});

export const eventRecurrenceSchema = z.enum([
  EVENT_RECURRENCE.DAILY,
  EVENT_RECURRENCE.WEEKLY,
  EVENT_RECURRENCE.MONTHLY,
]);

export const eventStatusSchema = z.enum([
  EVENT_STATUS.NOT_STARTED,
  EVENT_STATUS.IN_PROGRESS,
  EVENT_STATUS.COMPLETED,
  EVENT_STATUS.CANCELLED,
]);

export const eventSeriesSchema = baseEventSchema.extend({
  recurrence: eventRecurrenceSchema,
  schedule: scheduleSchema,
  isActive: z.boolean(),
});

export const eventSchema = baseEventSchema.extend({
  eventSeriesId: zid("eventSeries").optional(),
  date: z.number(),
  timeslots: z.array(timeslotSchema).min(1),
  status: eventStatusSchema,
});

export const eventParticipantSchema = z.object({
  eventId: zid("events"),
  timeslotId: z.string(),
  userId: zid("users"),
  joinedAt: z.number(),
  date: z.number(),
  isWaitlisted: z.boolean(),
});

export const eventSeriesCreateInputSchema = eventSeriesSchema.omit({
  createdBy: true,
  createdAt: true,
  modifiedAt: true,
});

export const eventCreateInputSchema = baseEventSchema
  .omit({
    createdBy: true,
    createdAt: true,
    modifiedAt: true,
  })
  .extend({
    date: z.number(),
  });

export const eventSeriesUpdateInputSchema = eventSeriesCreateInputSchema
  .omit({ clubId: true })
  .partial();

export const eventFiltersSchema = z.object({
  fromDate: z.number(),
  toDate: z.number(),
  query: z.string().optional(),
  clubIds: z.array(zid("clubs")).optional(),
  levelRange: levelRangeSchema.optional(),
  placeId: z.string().optional(),
});

export type EventSeries = DocumentByName<DataModel, "eventSeries">;
export type Event = DocumentByName<DataModel, "events">;
export type EventParticipant = DocumentByName<DataModel, "eventParticipants">;
export type EventSchedule = z.infer<typeof scheduleSchema>;
export type EventRecurrence = z.infer<typeof eventRecurrenceSchema>;
export type EventVisibility = z.infer<typeof eventVisibilitySchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type EventSeriesCreateInput = z.infer<typeof eventSeriesCreateInputSchema>;
export type EventSeriesUpdateInput = z.infer<typeof eventSeriesUpdateInputSchema>;
export type EventCreateInput = z.infer<typeof eventCreateInputSchema>;
export type TimeslotInput = z.infer<typeof timeslotInputSchema>;
export type Timeslot = z.infer<typeof timeslotSchema>;
export type EventFilters = z.infer<typeof eventFiltersSchema>;
export type EventDetails = DocumentByName<DataModel, "events"> & {
  participation: EventParticipant;
};

export const eventSeriesTable = defineTable(zodToConvex(eventSeriesSchema)).index("clubId", [
  "clubId",
]);

export const eventTable = defineTable(zodToConvex(eventSchema))
  .index("clubDate", ["clubId", "date"])
  .index("eventSeriesDate", ["eventSeriesId", "date"])
  .index("date", ["date"]);

export const eventParticipantTable = defineTable(zodToConvex(eventParticipantSchema))
  .index("eventId", ["eventId"])
  .index("userDate", ["userId", "date"])
  .index("eventUser", ["eventId", "userId"]);

export const eventTables = {
  eventSeries: eventSeriesTable,
  events: eventTable,
  eventParticipants: eventParticipantTable,
};
