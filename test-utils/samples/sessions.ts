import { Id } from "@/convex/_generated/dataModel";
import {
  FEE_TYPE,
  PAYMENT_TYPE,
  SESSION_RECURRENCE,
  SESSION_STATUS,
  SESSION_TYPE,
  SESSION_VISIBILITY,
  TIMESLOT_TYPE,
} from "@/convex/constants/sessions";
import schema from "@/convex/schema";
import {
  SessionInstance,
  SessionParticipant,
  SessionTemplate,
  SessionTemplateCreateInput,
  TimeslotInstance,
  TimeslotTemplate,
} from "@/convex/service/sessions/schemas";
import { TestConvex } from "convex-test";
import { WithoutSystemFields } from "convex/server";
import { genId } from "./id";

export const createTestTimeslotTemplate = (
  overrides?: Partial<TimeslotTemplate>,
): TimeslotTemplate => ({
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

export const createTestTimeslotInstance = (
  overrides?: Partial<TimeslotInstance>,
): TimeslotInstance => ({
  ...createTestTimeslotTemplate(overrides),
  id: "test-timeslot-id",
  numParticipants: 0,
  numWaitlisted: 0,
  ...overrides,
});

export const createTestSessionTemplateInput = (
  clubId: Id<"clubs">,
  overrides?: Partial<SessionTemplateCreateInput>,
): SessionTemplateCreateInput => ({
  clubId,
  name: "Test Session",
  description: "Test session description",
  location: {
    name: "Test Court",
    placeId: "test-place-id",
    address: "123 Test St",
    timezone: "America/New_York",
  },
  type: SESSION_TYPE.SOCIAL,
  schedule: {
    startTime: "09:00",
    endTime: "11:00",
    dayOfWeek: 1,
    startDate: Date.now() + 60 * 60 * 1000,
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
  },
  paymentType: PAYMENT_TYPE.CASH,
  visibility: SESSION_VISIBILITY.PUBLIC,
  levelRange: {
    min: 1,
    max: 5,
  },
  recurrence: SESSION_RECURRENCE.WEEKLY,
  timeslots: [createTestTimeslotTemplate()],
  isActive: true,
  ...overrides,
});

export const createTestSessionTemplate = (
  clubId: Id<"clubs">,
  createdBy: Id<"users">,
  overrides?: Partial<SessionTemplate>,
): WithoutSystemFields<SessionTemplate> => ({
  ...createTestSessionTemplateInput(clubId, overrides),
  createdBy,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
  ...overrides,
});

export const createTestSessionTemplateRecord = (
  clubId: Id<"clubs">,
  createdBy: Id<"users">,
  overrides?: Partial<SessionTemplate>,
): SessionTemplate => ({
  _id: genId<"sessionTemplates">("sessionTemplates"),
  _creationTime: Date.now(),
  ...createTestSessionTemplate(clubId, createdBy, overrides),
});

export const createTestSessionInstance = (
  sessionTemplateId: Id<"sessionTemplates">,
  clubId: Id<"clubs">,
  instanceDate: number,
  overrides?: Partial<SessionInstance>,
): WithoutSystemFields<SessionInstance> => ({
  sessionTemplateId,
  clubId,
  name: "Test Session Instance",
  description: "Test session instance description",
  location: {
    name: "Test Court",
    placeId: "test-place-id",
    address: "123 Test St",
    timezone: "America/New_York",
  },
  type: SESSION_TYPE.SOCIAL,
  schedule: {
    startTime: "09:00",
    endTime: "11:00",
    dayOfWeek: 1,
  },
  paymentType: PAYMENT_TYPE.CASH,
  visibility: SESSION_VISIBILITY.PUBLIC,
  levelRange: {
    min: 1,
    max: 5,
  },
  instanceDate,
  timeslots: [createTestTimeslotInstance()],
  status: SESSION_STATUS.NOT_STARTED,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
  ...overrides,
});

export const createTestSessionInstanceRecord = (
  sessionTemplateId: Id<"sessionTemplates">,
  clubId: Id<"clubs">,
  instanceDate: number,
  overrides?: Partial<SessionInstance>,
): SessionInstance => ({
  _id: genId<"sessionInstances">("sessionInstances"),
  _creationTime: Date.now(),
  ...createTestSessionInstance(sessionTemplateId, clubId, instanceDate, overrides),
});

export const createTestSessionParticipant = (
  sessionInstanceId: Id<"sessionInstances">,
  userId: Id<"users">,
  timeslotId: string,
  instanceDate: number,
  overrides?: Partial<SessionParticipant>,
): WithoutSystemFields<SessionParticipant> => ({
  sessionInstanceId,
  timeslotId,
  userId,
  joinedAt: Date.now(),
  instanceDate,
  isWaitlisted: false,
  ...overrides,
});

export const createTestSessionParticipantRecord = (
  sessionInstanceId: Id<"sessionInstances">,
  userId: Id<"users">,
  timeslotId: string,
  instanceDate: number,
  overrides?: Partial<SessionParticipant>,
): SessionParticipant => ({
  _id: genId<"sessionParticipants">("sessionParticipants"),
  _creationTime: Date.now(),
  ...createTestSessionParticipant(sessionInstanceId, userId, timeslotId, instanceDate, overrides),
});

export class SessionTestHelpers {
  constructor(private t: TestConvex<typeof schema>) {}

  async insertSessionTemplate(template: WithoutSystemFields<SessionTemplate>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("sessionTemplates", template);
    });
  }

  async insertSessionInstance(instance: WithoutSystemFields<SessionInstance>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("sessionInstances", instance);
    });
  }

  async insertSessionParticipant(participant: WithoutSystemFields<SessionParticipant>) {
    return await this.t.run(async (ctx) => {
      return await ctx.db.insert("sessionParticipants", participant);
    });
  }

  async getSessionTemplate(templateId: Id<"sessionTemplates">) {
    return await this.t.run(async (ctx) => ctx.db.get(templateId));
  }

  async getSessionInstance(instanceId: Id<"sessionInstances">) {
    return await this.t.run(async (ctx) => ctx.db.get(instanceId));
  }

  async getSessionParticipant(participantId: Id<"sessionParticipants">) {
    return await this.t.run(async (ctx) => ctx.db.get(participantId));
  }

  async deleteSessionTemplate(templateId: Id<"sessionTemplates">) {
    return await this.t.run(async (ctx) => ctx.db.delete(templateId));
  }

  async deleteSessionInstance(instanceId: Id<"sessionInstances">) {
    return await this.t.run(async (ctx) => ctx.db.delete(instanceId));
  }

  async deleteSessionParticipant(participantId: Id<"sessionParticipants">) {
    return await this.t.run(async (ctx) => ctx.db.delete(participantId));
  }
}
