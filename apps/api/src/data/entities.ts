// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ElectroDB key templates are plain strings it fills in
/**
 * Core entities in the single table (docs/design.md, "Data model"). Every key starts with the
 * tenant (`T#<tenantId>#`) so multi-coach needs no migration. `casing: 'none'` keeps ids as
 * written; ElectroDB lowercases keys by default.
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Entity, Service } from 'electrodb';

const SERVICE = 'racket-club';
const tenantId = { type: 'string', required: true, readOnly: true } as const;
// `const` keeps `composite` a tuple of attribute names, which ElectroDB needs to type keys.
const key = <const F extends string, const C extends readonly string[]>(
  field: F,
  template: string,
  composite: C,
) => ({ field, template, composite, casing: 'none' }) as const;

/** A session is one occurrence of a class, so its id is derived from the class and start. */
export function sessionIdOf(classId: string, startsAt: string): string {
  return `${classId}_${startsAt}`;
}

export function createEntities(client: DynamoDBDocumentClient, table: string) {
  const config = { client, table };

  const settings = new Entity(
    {
      model: { entity: 'settings', version: '1', service: SERVICE },
      attributes: {
        tenantId,
        branding: { type: 'any' },
        activePlugins: { type: 'list', items: { type: 'string' } },
      },
      indexes: {
        byTenant: {
          pk: key('pk', 'T#${tenantId}#TENANT', ['tenantId']),
          sk: key('sk', 'SETTINGS', []),
        },
      },
    },
    config,
  );

  const user = new Entity(
    {
      model: { entity: 'user', version: '1', service: SERVICE },
      attributes: {
        tenantId,
        userId: { type: 'string', required: true, readOnly: true },
        email: { type: 'string', required: true },
        name: { type: 'string', required: true },
        roles: { type: 'list', items: { type: 'string' }, required: true },
        /** The role users are listed under (gsi1); the highest of `roles`. */
        primaryRole: { type: ['owner', 'staff', 'student'] as const, required: true },
        locale: { type: ['en', 'vi'] as const, required: true, default: 'en' },
        // Onboarding answers (core/onboarding.ts); empty until the first-sign-in form is done.
        phone: { type: 'string' },
        skillLevel: { type: ['beginner', 'improver', 'intermediate', 'advanced'] as const },
        emergencyContact: {
          type: 'map',
          properties: { name: { type: 'string' }, phone: { type: 'string' } },
        },
        junior: { type: 'boolean' },
        guardian: {
          type: 'map',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
        },
        onboardedAt: { type: 'string' },
        createdAt: { type: 'string', required: true, readOnly: true },
      },
      indexes: {
        byId: {
          pk: key('pk', 'T#${tenantId}#USER#${userId}', ['tenantId', 'userId']),
          sk: key('sk', 'PROFILE', []),
        },
        byRole: {
          index: 'gsi1',
          pk: key('gsi1pk', 'T#${tenantId}#ROLE#${primaryRole}', ['tenantId', 'primaryRole']),
          sk: { ...key('gsi1sk', 'NAME#${name}#${userId}', ['name', 'userId']), casing: 'lower' },
        },
      },
    },
    config,
  );

  const klass = new Entity(
    {
      model: { entity: 'class', version: '1', service: SERVICE },
      attributes: {
        tenantId,
        classId: { type: 'string', required: true, readOnly: true },
        coachId: { type: 'string', required: true },
        name: { type: 'string', required: true },
        level: { type: 'string' },
        venue: { type: 'string' },
        capacity: { type: 'number', required: true },
        priceCents: { type: 'number', required: true },
        currency: { type: 'string', required: true },
        durationMinutes: { type: 'number', required: true },
        active: { type: 'boolean', required: true, default: true },
      },
      indexes: {
        byId: {
          pk: key('pk', 'T#${tenantId}#CLASS#${classId}', ['tenantId', 'classId']),
          sk: key('sk', 'META', []),
        },
        all: {
          index: 'gsi1',
          pk: key('gsi1pk', 'T#${tenantId}#CLASSES', ['tenantId']),
          sk: key('gsi1sk', 'CLASS#${classId}', ['classId']),
        },
      },
    },
    config,
  );

  const session = new Entity(
    {
      model: { entity: 'session', version: '1', service: SERVICE },
      attributes: {
        tenantId,
        classId: { type: 'string', required: true, readOnly: true },
        startsAt: { type: 'string', required: true, readOnly: true },
        sessionId: {
          type: 'string',
          readOnly: true,
          watch: ['classId', 'startsAt'],
          set: (_, item) => sessionIdOf(item.classId, item.startsAt),
        },
        coachId: { type: 'string', required: true },
        endsAt: { type: 'string', required: true },
        venue: { type: 'string' },
        capacity: { type: 'number', required: true },
        /** Seats taken. Only changed inside the booking transaction (condition booked < capacity). */
        booked: { type: 'number', required: true, default: 0 },
        cancelled: { type: 'boolean', required: true, default: false },
      },
      indexes: {
        byClass: {
          pk: key('pk', 'T#${tenantId}#CLASS#${classId}', ['tenantId', 'classId']),
          sk: key('sk', 'SESSION#${startsAt}', ['startsAt']),
        },
        calendar: {
          index: 'gsi1',
          pk: key('gsi1pk', 'T#${tenantId}#SESSIONS', ['tenantId']),
          sk: key('gsi1sk', '${startsAt}#${classId}', ['startsAt', 'classId']),
        },
      },
    },
    config,
  );

  const booking = new Entity(
    {
      model: { entity: 'booking', version: '1', service: SERVICE },
      attributes: {
        tenantId,
        sessionId: { type: 'string', required: true, readOnly: true },
        userId: { type: 'string', required: true, readOnly: true },
        bookingId: { type: 'string', required: true, readOnly: true },
        classId: { type: 'string', required: true, readOnly: true },
        startsAt: { type: 'string', required: true, readOnly: true },
        createdAt: { type: 'string', required: true, readOnly: true },
      },
      indexes: {
        roster: {
          pk: key('pk', 'T#${tenantId}#SESSION#${sessionId}', ['tenantId', 'sessionId']),
          sk: key('sk', 'BOOKING#${userId}', ['userId']),
        },
        byUser: {
          index: 'gsi1',
          pk: key('gsi1pk', 'T#${tenantId}#USER#${userId}', ['tenantId', 'userId']),
          sk: key('gsi1sk', 'BOOKING#${startsAt}#${sessionId}', ['startsAt', 'sessionId']),
        },
      },
    },
    config,
  );

  const invoice = new Entity(
    {
      model: { entity: 'invoice', version: '1', service: SERVICE },
      attributes: {
        tenantId,
        userId: { type: 'string', required: true, readOnly: true },
        invoiceId: { type: 'string', required: true, readOnly: true },
        reference: { type: 'string', required: true, readOnly: true },
        coachId: { type: 'string', required: true },
        currency: { type: 'string', required: true },
        lines: {
          type: 'list',
          required: true,
          items: {
            type: 'map',
            properties: {
              description: { type: 'string', required: true },
              amountCents: { type: 'number', required: true },
              sourceKind: { type: ['session', 'term', 'plugin'] as const, required: true },
              sourceRef: { type: 'string', required: true },
            },
          },
        },
        totalCents: { type: 'number', required: true },
        dueAt: { type: 'string', required: true },
        // Payments are a separate append-only ledger (Phase 1); status is kept here for gsi2.
        status: {
          type: ['unpaid', 'part_paid', 'paid', 'overpaid', 'void'] as const,
          required: true,
          default: 'unpaid',
        },
        createdAt: { type: 'string', required: true, readOnly: true },
      },
      indexes: {
        byUser: {
          pk: key('pk', 'T#${tenantId}#USER#${userId}', ['tenantId', 'userId']),
          sk: key('sk', 'INVOICE#${invoiceId}', ['invoiceId']),
        },
        byStatus: {
          index: 'gsi2',
          pk: key('gsi2pk', 'T#${tenantId}#STATUS#${status}', ['tenantId', 'status']),
          sk: key('gsi2sk', 'DUE#${dueAt}#${invoiceId}', ['dueAt', 'invoiceId']),
        },
      },
    },
    config,
  );

  return new Service({ settings, user, class: klass, session, booking, invoice }, config);
}

export type DataService = ReturnType<typeof createEntities>;
