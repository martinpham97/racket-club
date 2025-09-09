import { Id } from "@/convex/_generated/dataModel";
import {
  EVENT_STATUS,
  EVENT_TYPE,
  EVENT_VISIBILITY,
  FEE_TYPE,
  PAYMENT_TYPE,
  TIMESLOT_TYPE,
} from "@/convex/constants/events";
import {
  Event,
  EventCreateInput,
  EventParticipant,
  EventSeries,
  EventSeriesCreateInput,
  Timeslot,
  TimeslotInput,
} from "@/convex/service/events/schemas";
import { convexTest } from "@/convex/setup.testing";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestTimeslotInput = (overrides?: Partial<TimeslotInput>): TimeslotInput => ({
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
  ...createTestTimeslotInput(overrides),
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
  startTime: "09:00",
  endTime: "11:00",
  schedule: {
    daysOfWeek: [1],
    interval: 1,
    startDate: Date.now() + 60 * 60 * 1000,
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
  },
  paymentType: PAYMENT_TYPE.CASH,
  visibility: EVENT_VISIBILITY.PUBLIC,
  levelRange: {
    min: 1,
    max: 5,
  },
  timeslots: [createTestTimeslotInput()],
  isActive: true,
  ...overrides,
});

export const createTestEventInput = (
  clubId: Id<"clubs">,
  overrides?: Partial<EventCreateInput>,
): EventCreateInput => ({
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
  startTime: "09:00",
  endTime: "11:00",
  date: Date.now() + 24 * 60 * 60 * 1000,
  paymentType: PAYMENT_TYPE.CASH,
  visibility: EVENT_VISIBILITY.PUBLIC,
  levelRange: {
    min: 1,
    max: 5,
  },
  timeslots: [createTestTimeslotInput()],
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
  createdBy: Id<"users">,
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
  startTime: "09:00",
  endTime: "11:00",
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
  createdBy,
  ...overrides,
});

export const createTestEventRecord = (
  eventSeriesId: Id<"eventSeries">,
  clubId: Id<"clubs">,
  createdBy: Id<"users">,
  date: number,
  overrides?: Partial<Event>,
): Event => ({
  _id: genId<"events">("events"),
  _creationTime: Date.now(),
  ...createTestEvent(eventSeriesId, clubId, createdBy, date, overrides),
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
  constructor(private t: ReturnType<typeof convexTest>) {}

  async insertEventSeries(eventSeries: WithoutSystemFields<EventSeries>) {
    return await this.t.runWithCtx((ctx) => ctx.table("eventSeries").insert(eventSeries).get());
  }

  async insertEvent(event: WithoutSystemFields<Event>) {
    return await this.t.runWithCtx((ctx) => ctx.table("events").insert(event).get());
  }

  async insertEventParticipant(participant: WithoutSystemFields<EventParticipant>) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("eventParticipants").insert(participant).get(),
    );
  }

  async getEventSeries(eventSeriesId: Id<"eventSeries">) {
    return await this.t.runWithCtx((ctx) => ctx.table("eventSeries").get(eventSeriesId));
  }

  async getEvent(eventId: Id<"events">) {
    return await this.t.runWithCtx((ctx) => ctx.table("events").get(eventId));
  }

  async getEventParticipant(participantId: Id<"eventParticipants">) {
    return await this.t.runWithCtx((ctx) => ctx.table("eventParticipants").get(participantId));
  }

  async deleteEventSeries(eventSeriesId: Id<"eventSeries">) {
    return await this.t.runWithCtx((ctx) => ctx.table("eventSeries").getX(eventSeriesId).delete());
  }

  async deleteEvent(eventId: Id<"events">) {
    return await this.t.runWithCtx((ctx) => ctx.table("events").getX(eventId).delete());
  }

  async deleteEventParticipant(participantId: Id<"eventParticipants">) {
    return await this.t.runWithCtx((ctx) =>
      ctx.table("eventParticipants").getX(participantId).delete(),
    );
  }
}
