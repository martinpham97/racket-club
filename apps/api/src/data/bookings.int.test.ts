import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { localNames } from '../local-aws';
import { bookSeat } from './bookings';
import { createDb } from './client';
import { sessionIdOf } from './entities';

const { data } = createDb(localNames.table);
const tenantId = `test-${randomUUID()}`;
const startsAt = '2026-12-07T07:00:00.000Z';

async function newSession(capacity: number, extra: { cancelled?: boolean } = {}) {
  const classId = `class-${randomUUID()}`;
  await data.entities.session
    .create({
      tenantId,
      classId,
      startsAt,
      endsAt: '2026-12-07T08:30:00.000Z',
      coachId: 'coach',
      capacity,
      ...extra,
    })
    .go();
  return classId;
}

const book = (classId: string, userId: string) =>
  bookSeat(data, {
    tenantId,
    classId,
    startsAt,
    userId,
    bookingId: randomUUID(),
    createdAt: '2026-12-01T00:00:00.000Z',
  });

async function seatsTaken(classId: string) {
  const session = await data.entities.session.get({ tenantId, classId, startsAt }).go();
  const roster = await data.entities.booking.query
    .roster({ tenantId, sessionId: sessionIdOf(classId, startsAt) })
    .go({ pages: 'all' });
  return { booked: session.data?.booked, roster: roster.data.length };
}

const students = (n: number, prefix = 'student') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

describe('bookSeat', () => {
  it('lets exactly one of 20 parallel requests take the last spot', async () => {
    const classId = await newSession(5);
    for (const userId of students(4, 'early')) {
      expect((await book(classId, userId)).kind).toBe('booked');
    }

    const results = await Promise.all(students(20).map((u) => book(classId, u)));

    expect(results.filter((r) => r.kind === 'booked')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'rejected' && r.reason === 'full')).toHaveLength(19);
    expect(await seatsTaken(classId)).toEqual({ booked: 5, roster: 5 });
  });

  it('never fills past capacity when 20 students rush an empty session', async () => {
    const classId = await newSession(5);
    const results = await Promise.all(students(20).map((u) => book(classId, u)));
    expect(results.filter((r) => r.kind === 'booked')).toHaveLength(5);
    expect(await seatsTaken(classId)).toEqual({ booked: 5, roster: 5 });
  });

  it('books a student once, even when they tap twice at the same time', async () => {
    const classId = await newSession(10);
    const [a, b] = await Promise.all([book(classId, 'linh'), book(classId, 'linh')]);
    expect([a.kind, b.kind].sort()).toEqual(['booked', 'rejected']);
    expect(await book(classId, 'linh')).toEqual({ kind: 'rejected', reason: 'already-booked' });
    expect(await seatsTaken(classId)).toEqual({ booked: 1, roster: 1 });
  });

  it('rejects cancelled and missing sessions without taking a seat', async () => {
    const cancelled = await newSession(10, { cancelled: true });
    expect(await book(cancelled, 'sam')).toEqual({ kind: 'rejected', reason: 'unavailable' });
    expect(await seatsTaken(cancelled)).toEqual({ booked: 0, roster: 0 });

    expect(await book(`class-${randomUUID()}`, 'sam')).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    });
  });
});
