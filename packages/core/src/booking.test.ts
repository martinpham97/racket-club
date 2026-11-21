import { describe, expect, it } from 'vitest';
import { cancelBooking, requestBooking, type SessionState, spotsLeft } from './booking';
import { fixedClock, HOUR_MS } from './clock';

const session = (over: Partial<SessionState> = {}): SessionState => ({
  id: 's1',
  coachId: 'owner',
  startsAt: '2026-12-01T08:00:00.000Z',
  capacity: 2,
  bookedUserIds: [],
  waitlistUserIds: [],
  cancelled: false,
  ...over,
});

describe('requestBooking', () => {
  const clock = fixedClock('2026-11-28T08:00:00.000Z');

  it('books a seat when there is space', () => {
    const r = requestBooking(session(), 'u1', clock);
    expect(r.kind).toBe('booked');
    if (r.kind === 'booked') expect(r.session.bookedUserIds).toEqual(['u1']);
  });

  it('waitlists in order when full', () => {
    const full = session({ bookedUserIds: ['a', 'b'], waitlistUserIds: ['c'] });
    const r = requestBooking(full, 'd', clock);
    expect(r).toMatchObject({ kind: 'waitlisted', position: 2 });
  });

  it('never exceeds capacity across many requests', () => {
    let s = session({ capacity: 5 });
    for (let i = 0; i < 20; i++) {
      const r = requestBooking(s, `u${i}`, clock);
      if (r.kind !== 'rejected') s = r.session;
    }
    expect(s.bookedUserIds).toHaveLength(5);
    expect(s.waitlistUserIds).toHaveLength(15);
    expect(spotsLeft(s)).toBe(0);
  });

  it('rejects double booking and double waitlisting', () => {
    expect(requestBooking(session({ bookedUserIds: ['u1'] }), 'u1', clock)).toEqual({
      kind: 'rejected',
      reason: 'already-booked',
    });
    expect(
      requestBooking(session({ bookedUserIds: ['a', 'b'], waitlistUserIds: ['u1'] }), 'u1', clock),
    ).toEqual({ kind: 'rejected', reason: 'already-waitlisted' });
  });

  it('rejects cancelled sessions and sessions that have started', () => {
    expect(requestBooking(session({ cancelled: true }), 'u1', clock)).toMatchObject({
      reason: 'cancelled',
    });
    const late = fixedClock('2026-12-01T08:00:00.000Z');
    expect(requestBooking(session(), 'u1', late)).toMatchObject({ reason: 'closed' });
  });
});

describe('cancelBooking', () => {
  it('promotes the first waitlisted student', () => {
    const clock = fixedClock('2026-11-28T08:00:00.000Z');
    const s = session({ bookedUserIds: ['a', 'b'], waitlistUserIds: ['c', 'd'] });
    const r = cancelBooking(s, 'a', clock);
    expect(r.kind).toBe('cancelled');
    if (r.kind === 'cancelled') {
      expect(r.promotedUserId).toBe('c');
      expect(r.session.bookedUserIds).toEqual(['b', 'c']);
      expect(r.session.waitlistUserIds).toEqual(['d']);
    }
  });

  it('enforces the cut-off unless forced by staff', () => {
    const clock = fixedClock('2026-12-01T08:00:00.000Z');
    clock.advance(-23 * HOUR_MS); // 23 hours before start, cut-off is 24
    const s = session({ bookedUserIds: ['a'] });
    expect(cancelBooking(s, 'a', clock)).toEqual({ kind: 'rejected', reason: 'past-cutoff' });
    expect(cancelBooking(s, 'a', clock, undefined, true).kind).toBe('cancelled');
  });

  it('lets a student leave the waitlist at any time', () => {
    const clock = fixedClock('2026-12-01T07:00:00.000Z');
    const s = session({ bookedUserIds: ['a', 'b'], waitlistUserIds: ['c'] });
    const r = cancelBooking(s, 'c', clock);
    expect(r).toMatchObject({ kind: 'cancelled', promotedUserId: null });
  });

  it('rejects students who are not on the session', () => {
    const clock = fixedClock('2026-11-28T08:00:00.000Z');
    expect(cancelBooking(session(), 'x', clock)).toEqual({
      kind: 'rejected',
      reason: 'not-booked',
    });
  });
});
