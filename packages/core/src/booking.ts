import { type Clock, HOUR_MS } from './clock';

export interface SessionState {
  id: string;
  coachId: string; // always the owner in single-coach mode; kept for the multi-coach plugin
  startsAt: string; // UTC ISO
  capacity: number;
  bookedUserIds: string[];
  waitlistUserIds: string[]; // in order of joining
  cancelled: boolean;
}

export interface BookingRules {
  /** Students may cancel up to this many hours before the session starts. */
  cancelCutoffHours: number;
  /** Bookings close this many minutes before the start. */
  bookingClosesMinutesBefore: number;
}

export const defaultBookingRules: BookingRules = {
  cancelCutoffHours: 24,
  bookingClosesMinutesBefore: 0,
};

export type BookResult =
  | { kind: 'booked'; session: SessionState }
  | { kind: 'waitlisted'; position: number; session: SessionState }
  | { kind: 'rejected'; reason: 'already-booked' | 'already-waitlisted' | 'closed' | 'cancelled' };

/**
 * Pure booking decision. In AWS the same rule is enforced atomically by a DynamoDB
 * transaction (condition `booked < capacity`); this function decides what to attempt.
 */
export function requestBooking(
  session: SessionState,
  userId: string,
  clock: Clock,
  rules: BookingRules = defaultBookingRules,
): BookResult {
  if (session.cancelled) return { kind: 'rejected', reason: 'cancelled' };
  if (session.bookedUserIds.includes(userId)) return { kind: 'rejected', reason: 'already-booked' };
  if (session.waitlistUserIds.includes(userId)) {
    return { kind: 'rejected', reason: 'already-waitlisted' };
  }
  const closesAt = new Date(session.startsAt).getTime() - rules.bookingClosesMinutesBefore * 60_000;
  if (clock.now().getTime() >= closesAt) return { kind: 'rejected', reason: 'closed' };

  if (session.bookedUserIds.length < session.capacity) {
    return {
      kind: 'booked',
      session: { ...session, bookedUserIds: [...session.bookedUserIds, userId] },
    };
  }
  const waitlistUserIds = [...session.waitlistUserIds, userId];
  return {
    kind: 'waitlisted',
    position: waitlistUserIds.length,
    session: { ...session, waitlistUserIds },
  };
}

export type CancelResult =
  | { kind: 'cancelled'; session: SessionState; promotedUserId: string | null }
  | { kind: 'rejected'; reason: 'not-booked' | 'past-cutoff' };

/**
 * A student cancels. If they held a seat, the first waitlisted student is promoted.
 * Staff can override the cut-off with `force`.
 */
export function cancelBooking(
  session: SessionState,
  userId: string,
  clock: Clock,
  rules: BookingRules = defaultBookingRules,
  force = false,
): CancelResult {
  const onWaitlist = session.waitlistUserIds.includes(userId);
  const booked = session.bookedUserIds.includes(userId);
  if (!booked && !onWaitlist) return { kind: 'rejected', reason: 'not-booked' };

  if (onWaitlist) {
    return {
      kind: 'cancelled',
      promotedUserId: null,
      session: { ...session, waitlistUserIds: session.waitlistUserIds.filter((u) => u !== userId) },
    };
  }

  const cutoff = new Date(session.startsAt).getTime() - rules.cancelCutoffHours * HOUR_MS;
  if (!force && clock.now().getTime() > cutoff) return { kind: 'rejected', reason: 'past-cutoff' };

  const remaining = session.bookedUserIds.filter((u) => u !== userId);
  const [promoted, ...restWaitlist] = session.waitlistUserIds;
  return {
    kind: 'cancelled',
    promotedUserId: promoted ?? null,
    session: {
      ...session,
      bookedUserIds: promoted ? [...remaining, promoted] : remaining,
      waitlistUserIds: promoted ? restWaitlist : session.waitlistUserIds,
    },
  };
}

export function spotsLeft(session: SessionState): number {
  return Math.max(0, session.capacity - session.bookedUserIds.length);
}
