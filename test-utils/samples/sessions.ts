import { Id } from "@/convex/_generated/dataModel";
import {
  FEE_TYPE,
  PENALTY_TYPE,
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

// Test helpers to create schedule objects
export const createOneTimeSchedule = (overrides = {}) => ({
  date: Date.now() + 7 * 24 * 60 * 60 * 1000, // Next week
  startTime: "18:00",
  endTime: "20:00",
  ...overrides,
});

export const createRecurringSchedule = (overrides = {}) => ({
  startDate: Date.now() + 24 * 60 * 60 * 1000, // Tomorrow
  endDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
  startTime: "18:00",
  endTime: "20:00",
  ...overrides,
});

export const createWeeklySchedule = (overrides = {}) => ({
  ...createRecurringSchedule(),
  dayOfWeek: 1, // Monday
  ...overrides,
});

export const createMonthlySchedule = (overrides = {}) => ({
  ...createRecurringSchedule(),
  dayOfMonth: 15,
  ...overrides,
});

// Test helpers to create timeslot objects
export const createDurationTimeslot = (overrides = {}) => ({
  type: TIMESLOT_TYPE.DURATION,
  duration: 120,
  name: "Test Slot",
  maxParticipants: 10,
  permanentParticipants: [],
  feeType: FEE_TYPE.SPLIT,
  fee: 10,
  ...overrides,
});

export const createStartEndTimeslot = (overrides = {}) => ({
  type: TIMESLOT_TYPE.START_END,
  startTime: "18:30",
  endTime: "19:30",
  name: "Test Slot",
  maxParticipants: 10,
  permanentParticipants: [],
  feeType: FEE_TYPE.SPLIT,
  fee: 10,
  ...overrides,
});

export const createTestTimeslot = (overrides?: Partial<TimeslotTemplate>): TimeslotTemplate => {
  return {
    type: TIMESLOT_TYPE.DURATION,
    duration: 120,
    name: "Test Timeslot",
    maxParticipants: 10,
    permanentParticipants: [],
    fee: 10,
    feeType: FEE_TYPE.FIXED,
    ...overrides,
  };
};

export const createTestTimeslotInstance = (overrides?: Partial<TimeslotInstance>) => {
  return {
    id: "timeslot1",
    ...createTestTimeslot(overrides),
  };
};

export const createTestSessionTemplateInput = (
  overrides?: Partial<SessionTemplateCreateInput>,
): SessionTemplateCreateInput => {
  return {
    clubId: genId<"clubs">("clubs"),
    recurrence: SESSION_RECURRENCE.WEEKLY,
    name: "Test Session Template",
    description: "Test session description",
    type: SESSION_TYPE.TRAINING,
    schedule: {
      startDate: Date.now() + 86400000, // Tomorrow
      endDate: Date.now() + 2592000000, // 30 days from now
      dayOfWeek: 1, // Monday
      startTime: "18:00",
      endTime: "20:00",
    },
    timeslots: [createTestTimeslot({ name: "Main Session" })],
    maxWaitlist: 5,
    graceTime: {
      hours: 24,
      penaltyType: PENALTY_TYPE.FIXED,
      penaltyAmount: 10,
    },
    paymentType: "cash" as const,
    location: {
      name: "Test Location",
      placeId: "test-place-id",
      address: "123 Test St",
      timezone: "America/New_York",
    },
    levelRange: {
      min: 1,
      max: 5,
    },
    visibility: SESSION_VISIBILITY.PUBLIC,
    isActive: true,
    ...overrides,
  };
};

export const createTestSessionTemplate = (
  createdBy: Id<"users">,
  overrides?: Partial<SessionTemplate>,
): WithoutSystemFields<SessionTemplate> => {
  return {
    ...createTestSessionTemplateInput(overrides),
    createdBy,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    ...overrides,
  };
};

export const createTestSessionTemplateRecord = (
  createdBy: Id<"users">,
  overrides?: Partial<SessionTemplate>,
): SessionTemplate => {
  return {
    _id: genId<"sessionTemplates">("sessionTemplates"),
    _creationTime: Date.now(),
    ...createTestSessionTemplate(createdBy, overrides),
  };
};

export const createTestSessionInstance = (
  sessionTemplateId: Id<"sessionTemplates">,
  overrides?: Partial<SessionInstance>,
): WithoutSystemFields<SessionInstance> => {
  return {
    sessionTemplateId,
    instanceDate: Date.now() + 86400000, // Tomorrow
    status: SESSION_STATUS.NOT_STARTED,
    clubId: genId<"clubs">("clubs"),
    name: "Test Session Instance",
    description: "Test session instance description",
    type: SESSION_TYPE.TRAINING,
    schedule: {
      startDate: Date.now() + 86400000,
      endDate: Date.now() + 2592000000,
      dayOfWeek: 1,
      startTime: "18:00",
      endTime: "20:00",
    },
    timeslots: [createTestTimeslotInstance({ name: "Main Session" })],
    maxWaitlist: 5,
    graceTime: {
      hours: 24,
      penaltyType: PENALTY_TYPE.FIXED,
      penaltyAmount: 10,
    },
    paymentType: "cash" as const,
    location: {
      name: "Test Location",
      placeId: "test-place-id",
      address: "123 Test St",
      timezone: "America/New_York",
    },
    levelRange: {
      min: 1,
      max: 5,
    },
    visibility: SESSION_VISIBILITY.PUBLIC,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    ...overrides,
  };
};

export const createTestSessionInstanceRecord = (
  sessionTemplateId: Id<"sessionTemplates">,
  overrides?: Partial<SessionInstance>,
): SessionInstance => {
  return {
    _id: genId<"sessionInstances">("sessionInstances"),
    _creationTime: Date.now(),
    ...createTestSessionInstance(sessionTemplateId, overrides),
  };
};

export const createTestSessionParticipant = (
  sessionInstanceId: Id<"sessionInstances">,
  userId: Id<"users">,
  overrides?: Partial<SessionParticipant>,
): WithoutSystemFields<SessionParticipant> => {
  return {
    sessionInstanceId,
    userId,
    timeslotId: "timeslot1",
    joinedAt: Date.now(),
    isWaitlisted: false,
    ...overrides,
  };
};

export const createTestSessionParticipantRecord = (
  sessionInstanceId: Id<"sessionInstances">,
  userId: Id<"users">,
  overrides?: Partial<SessionParticipant>,
): SessionParticipant => {
  return {
    _id: genId<"sessionParticipants">("sessionParticipants"),
    _creationTime: Date.now(),
    ...createTestSessionParticipant(sessionInstanceId, userId, overrides),
  };
};

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
