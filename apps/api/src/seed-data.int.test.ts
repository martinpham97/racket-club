import { randomUUID } from 'node:crypto';
import { fixedClock } from '@racket-club/core';
import { describe, expect, it } from 'vitest';
import { createDb } from './data/client';
import { sessionIdOf } from './data/entities';
import { localNames } from './local-aws';
import { seedDemoData } from './seed-data';

const { data } = createDb(localNames.table);

describe('seedDemoData', () => {
  it('creates a coach, 20 students, a term of classes, bookings and invoices, once', async () => {
    const tenantId = `test-${randomUUID()}`;
    // A Thursday in Sydney: the term starts the following Monday.
    const clock = fixedClock('2026-12-03T01:00:00.000Z');

    const result = await seedDemoData(data, clock, tenantId);
    expect(result).toMatchObject({
      seeded: true,
      users: 22,
      classes: 3,
      sessions: 30,
      invoices: 8,
      termStarts: '2026-12-07',
    });

    const students = await data.entities.user.query
      .byRole({ tenantId, primaryRole: 'student' })
      .go({ pages: 'all' });
    expect(students.data).toHaveLength(20);

    // Mondays 6 pm in Sydney (summer time, UTC+11).
    const first = await data.entities.session
      .get({ tenantId, classId: 'beginners', startsAt: '2026-12-07T07:00:00.000Z' })
      .go();
    expect(first.data).toMatchObject({ capacity: 12, cancelled: false });
    const roster = await data.entities.booking.query
      .roster({ tenantId, sessionId: sessionIdOf('beginners', '2026-12-07T07:00:00.000Z') })
      .go({ pages: 'all' });
    expect(roster.data.length).toBe(first.data?.booked);
    expect(roster.data.length).toBeGreaterThan(0);

    const unpaid = await data.entities.invoice.query
      .byStatus({ tenantId, status: 'unpaid' })
      .go({ pages: 'all' });
    expect(unpaid.data).toHaveLength(8);

    expect(await seedDemoData(data, clock, tenantId)).toEqual({ seeded: false });
  });
});
