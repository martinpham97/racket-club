import { Id } from "@/convex/_generated/dataModel";
import {
  EVENT_RECURRENCE,
  EVENT_STATUS,
  EVENT_TYPE,
  EVENT_VISIBILITY,
  FEE_TYPE,
  PAYMENT_TYPE,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import schema from "@/convex/schema";
import {
  Event,
  EventParticipant,
  EventSeries,
  EventSeriesCreateInput,
  Timeslot,
  TimeslotSeries,
} from "@/convex/service/events/schemas";
import { TestConvex } from "convex-test";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestTimeslotSeries = (overrides?: Partial<TimeslotSeries>): TimeslotSeries => ({
  name: "Test Timeslot",
  type: TIMESLOT_TYPE.DURATION,
  duration: 60,
  feeType: FEE_TYPE.FIXED,
  fee: 25,
  maxParticipants: 4,
  maxWaitlist: 10,
  permanentParticipants: [],
  ...overrides,
});

export const createTestTimeslot = (overrides?: Partial<Timeslot>): Timeslot => ({
  ...createTestTimeslotSeries(overrides),
  id: "test-timeslot-id",
  numParticipants: 0,
  numWaitlisted: 0,
  ...overrides,
});

export const createTestEventSeriesInput = (
  clubId: Id<"clubs">,
  overrides?: Partial<EventSeriesCreateInput>,
): EventSeriesCreateInput => ({
  clubId,
  name: "Test Event",
  description: "Test event description",
  location: {
    name: "Test Court",
    placeId: "test-place-id",
    address: "123 Test St",
    timezone: "America/New_York",
  },
  type: EVENT_TYPE.SOCIAL,
  schedule: {
    startTime: "09:00",
    endTime: "11:00",
    dayOfWeek: 1,
    startDate: Date.now() + 60 * 60 * 1000,
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
  },
  paymentType: PAYMENT_TYPE.CASH,
  visibility: EVENT_VISIBILITY.PUBLIC,
  levelRange: {
    min: 1,
    max: 5,
  },
  recurrence: EVENT_RECURRENCE.WEEKLY,
  timeslots: [createTestTimeslotSeries()],
  isActive: true,
  ...overrides,
});

export const createTestEventSeries = (
  clubId: Id<"clubs">,
  createdBy: Id<"users">,
  overrides?: Partial<EventSeries>,
): WithoutSystemFields<EventSeries> => ({
  ...createTestEventSeriesInput(clubId, overrides),
  createdBy,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
  ...overrides,
});

export const createTestEventSeriesRecord = (
  clubId: Id<"clubs">,
  createdBy: Id<"users">,
  overrides?: Partial<EventSeries>,
): EventSeries => ({
  _id: genId<"eventSeries">("eventSeries"),
  _creationTime: Date.now(),
  ...createTestEventSeries(clubId, createdBy, overrides),
});

export const createTestEvent = (
  eventSeriesId: Id<"eventSeries">,
  clubId: Id<"clubs">,
  date: number,
  overrides?: Partial<Event>,
): WithoutSystemFields<Event> => ({
  eventSeriesId,
  clubId,
  name: "Test Event",
  description: "Test event description",
  location: {
    name: "Test Court",
    placeId: "test-place-id",
    address: "123 Test St",
    timezone: "America/New_York",
  },
  type: EVENT_TYPE.SOCIAL,
  schedule: {
    startTime: "09:00",
    endTime: "11:00",
    dayOfWeek: 1,
  },
  paymentType: PAYMENT_TYPE.CASH,
  visibility: EVENT_VISIBILITY.PUBLIC,
  levelRange: {
    min: 1,
    max: 5,
  },
  date,
  timeslots: [createTestTimeslot()],
  status: EVENT_STATUS.NOT_STARTED,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
  ...overrides,
});

export const createTestEventRecord = (
  eventSeriesId: Id<"eventSeries">,
  clubId: Id<"clubs">,
  date: number,
  overrides?: Partial<Event>,
): Event => ({
  _id: genId<"events">("events"),
  _creationTime: Date.now(),
  ...createTestEvent(eventSeriesId, clubId, date, overrides),
});

export const createTestEventParticipant = (
  eventId: Id<"events">,
  userId: Id<"users">,
  timeslotId: string,
  date: number,
  overrides?: Partial<EventParticipant>,
): WithoutSystemFields<EventParticipant> => ({
  eventId,
  timeslotId,
  userId,
  joinedAt: Date.now(),
  date,
  isWaitlisted: false,
  ...overrides,
});

export const createTestEventParticipantRecord = (
  eventId: Id<"events">,
  userId: Id<"users">,
  timeslotId: string,
  date: number,
  overrides?: Partial<EventParticipant>,
): EventParticipant => ({
  _id: genId<"eventParticipants">("eventParticipants"),
  _creationTime: Date.now(),
  ...createTestEventParticipant(eventId, userId, timeslotId, date, overrides),
});

export class EventTestHelpers {
  constructor(private t: TestConvex<typeof schema>) {}

  async insertEventSeries(eventSeries: WithoutSystemFields<EventSeries>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("eventSeries", eventSeries);
    });
  }

  async insertEvent(event: WithoutSystemFields<Event>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("events", event);
    });
  }

  async insertEventParticipant(participant: WithoutSystemFields<EventParticipant>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("eventParticipants", participant);
    });
  }

  async getEventSeries(eventSeriesId: Id<"eventSeries">) {
    return await this.t.run(async (ctx) => ctx.db.get(eventSeriesId));
  }

  async getEvent(eventId: Id<"events">) {
    return await this.t.run(async (ctx) => ctx.db.get(eventId));
  }

  async getEventParticipant(participantId: Id<"eventParticipants">) {
    return await this.t.run(async (ctx) => ctx.db.get(participantId));
  }

  async deleteEventSeries(eventSeriesId: Id<"eventSeries">) {
    return await this.t.run(async (ctx) => ctx.db.delete(eventSeriesId));
  }

  async deleteEvent(eventId: Id<"events">) {
    return await this.t.run(async (ctx) => ctx.db.delete(eventId));
  }

  async deleteEventParticipant(participantId: Id<"eventParticipants">) {
    return await this.t.run(async (ctx) => ctx.db.delete(participantId));
  }
}
