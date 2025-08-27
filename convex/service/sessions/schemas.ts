import { DataModel } from "@/convex/_generated/dataModel";
import {
  SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR,
  TIME_FORMAT_ERROR,
  TIMESLOT_DURATION_MORE_THAN_24_HOURS_ERROR,
} from "@/convex/constants/errors";
import {
  DISCOUNT_TYPE,
  FEE_TYPE,
  MAX_DISCOUNT_DESCRIPTION_LENGTH,
  MAX_DISCOUNTS,
  MAX_GRACE_TIME_HOURS,
  MAX_PARTICIPANTS,
  MAX_SESSION_DESCRIPTION_LENGTH,
  MAX_SESSION_NAME_LENGTH,
  MAX_TIMESLOT_NAME_LENGTH,
  MAX_WAITLIST,
  MIN_GRACE_TIME_HOURS,
  MIN_PARTICIPANTS,
  MIN_WAITLIST,
  PAYMENT_TYPE,
  PENALTY_TYPE,
  SESSION_RECURRENCE,
  SESSION_STATUS,
  SESSION_TYPE,
  SESSION_VISIBILITY,
  TIME_FORMAT_REGEX,
  TIMESLOT_TYPE,
} from "@/convex/constants/sessions";
import { zid, zodToConvex } from "convex-helpers/server/zod";
import { defineTable, DocumentByName } from "convex/server";
import z from "zod";

export const sessionInstanceFiltersSchema = z.object({
  fromDate: z.number(),
  toDate: z.number(),
  clubIds: z.array(zid("clubs")).optional(),
  skillLevelMin: z.number().min(0).max(5).optional(),
  skillLevelMax: z.number().min(0).max(5).optional(),
  location: z.string().optional(),
});

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
  date: z.number().optional(),
  startDate: z.number().optional(),
  endDate: z.number().optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  startTime: z.string().regex(TIME_FORMAT_REGEX, TIME_FORMAT_ERROR),
  endTime: z.string().regex(TIME_FORMAT_REGEX, TIME_FORMAT_ERROR),
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
    .min(MIN_PARTICIPANTS, SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR)
    .max(MAX_PARTICIPANTS, SESSION_TIMESLOT_INVALID_MAX_PARTICIPANT_ERROR),
  maxWaitlist: z.number().min(MIN_WAITLIST).max(MAX_WAITLIST),
  permanentParticipants: z.array(zid("users")).max(MAX_PARTICIPANTS),
});

const timeslotTemplateSchema = baseTimeslotSchema;

const timeslotInstanceSchema = baseTimeslotSchema.extend({
  id: z.string(),
  numParticipants: z.number(),
  numWaitlisted: z.number(),
});

export const sessionVisibilitySchema = z.enum([
  SESSION_VISIBILITY.MEMBERS_ONLY,
  SESSION_VISIBILITY.PUBLIC,
]);

export const baseSessionSchema = z.object({
  clubId: zid("clubs"),
  name: z.string().max(MAX_SESSION_NAME_LENGTH),
  description: z.string().max(MAX_SESSION_DESCRIPTION_LENGTH).optional(),
  location: locationSchema,
  logo: z.string().optional(),
  banner: z.string().optional(),
  type: z.enum([SESSION_TYPE.SOCIAL, SESSION_TYPE.TRAINING]),
  schedule: scheduleSchema,

  paymentType: z.enum([PAYMENT_TYPE.CASH]),
  visibility: sessionVisibilitySchema,
  graceTime: graceTimeSchema.optional(),
  levelRange: levelRangeSchema,
  createdAt: z.number(),
  modifiedAt: z.number().optional(),
});

export const sessionRecurrenceSchema = z.enum([
  SESSION_RECURRENCE.ONE_TIME,
  SESSION_RECURRENCE.DAILY,
  SESSION_RECURRENCE.WEEKLY,
  SESSION_RECURRENCE.MONTHLY,
]);

export const sessionTemplateSchema = baseSessionSchema.extend({
  recurrence: sessionRecurrenceSchema,
  timeslots: z.array(timeslotTemplateSchema).min(1),
  createdBy: zid("users"),
  isActive: z.boolean(),
  next_scheduled_id: zid("_scheduled_functions").optional(),
});

export const sessionInstanceStatusSchema = z.enum([
  SESSION_STATUS.NOT_STARTED,
  SESSION_STATUS.IN_PROGRESS,
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.CANCELLED,
]);

export const sessionInstanceSchema = baseSessionSchema.extend({
  sessionTemplateId: zid("sessionTemplates"),
  instanceDate: z.number(),
  timeslots: z.array(timeslotInstanceSchema).min(1),
  status: sessionInstanceStatusSchema,
});

export const sessionParticipantSchema = z.object({
  sessionInstanceId: zid("sessionInstances"),
  timeslotId: z.string(),
  userId: zid("users"),
  joinedAt: z.number(),
  instanceDate: z.number(),
  isWaitlisted: z.boolean(),
});

export const sessionTemplateCreateInputSchema = sessionTemplateSchema.omit({
  createdBy: true,
  createdAt: true,
  modifiedAt: true,
});

export const sessionTemplateUpdateInputSchema = sessionTemplateCreateInputSchema
  .partial()
  .required({
    clubId: true,
  });

export type SessionTemplate = DocumentByName<DataModel, "sessionTemplates">;
export type SessionInstance = DocumentByName<DataModel, "sessionInstances">;
export type SessionParticipant = DocumentByName<DataModel, "sessionParticipants">;
export type SessionSchedule = z.infer<typeof scheduleSchema>;
export type SessionRecurrence = z.infer<typeof sessionRecurrenceSchema>;
export type SessionVisibility = z.infer<typeof sessionVisibilitySchema>;
export type SessionInstanceStatus = z.infer<typeof sessionInstanceStatusSchema>;
export type SessionTemplateCreateInput = z.infer<typeof sessionTemplateCreateInputSchema>;
export type SessionTemplateUpdateInput = z.infer<typeof sessionTemplateUpdateInputSchema>;
export type TimeslotTemplate = z.infer<typeof timeslotTemplateSchema>;
export type TimeslotInstance = z.infer<typeof timeslotInstanceSchema>;
export type SessionInstanceFilters = z.infer<typeof sessionInstanceFiltersSchema>;

export type SessionInstanceDetails = DocumentByName<DataModel, "sessionInstances"> & {
  participation: SessionParticipant;
};

export const sessionTemplateTable = defineTable(zodToConvex(sessionTemplateSchema))
  .index("clubId", ["clubId"])
  .index("visibility", ["visibility"])
  .index("location", ["location.placeId"])
  .index("levelRange", ["levelRange.min", "levelRange.max"])
  .index("schedule", ["schedule.startDate"])
  .index("createdBy", ["createdBy"]);

export const sessionInstanceTable = defineTable(zodToConvex(sessionInstanceSchema))
  .index("clubIdInstanceDate", ["clubId", "instanceDate"])
  .index("sessionTemplateIdInstanceDate", ["sessionTemplateId", "instanceDate"])
  .index("instanceDate", ["instanceDate"]);

export const sessionParticipantTable = defineTable(zodToConvex(sessionParticipantSchema))
  .index("sessionInstanceId", ["sessionInstanceId"])
  .index("timeslotId", ["timeslotId"])
  .index("userIdInstanceDate", ["userId", "instanceDate"])
  .index("instanceUser", ["sessionInstanceId", "userId"])
  .index("timeslotWaitlistJoinedAt", ["timeslotId", "isWaitlisted", "joinedAt"]);

export const sessionTables = {
  sessionTemplates: sessionTemplateTable,
  sessionInstances: sessionInstanceTable,
  sessionParticipants: sessionParticipantTable,
};
