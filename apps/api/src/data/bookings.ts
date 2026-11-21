import type { DataService } from './entities';
import { sessionIdOf } from './entities';

export interface BookSeatInput {
  tenantId: string;
  classId: string;
  startsAt: string;
  userId: string;
  bookingId: string;
  createdAt: string;
}

export type BookSeatResult =
  | { kind: 'booked'; sessionId: string; bookingId: string }
  | { kind: 'rejected'; reason: 'full' | 'already-booked' | 'unavailable' };

/** Concurrent transactions on one session can conflict; DynamoDB asks the caller to retry. */
const MAX_ATTEMPTS = 8;

/**
 * Take a seat. One DynamoDB transaction increments the session's `booked` count on condition
 * `booked < capacity` (and not cancelled) and creates the booking on condition it doesn't exist,
 * so parallel requests for the last seat can never overbook.
 */
export async function bookSeat(data: DataService, input: BookSeatInput): Promise<BookSeatResult> {
  const { tenantId, classId, startsAt, userId } = input;
  const sessionId = sessionIdOf(classId, startsAt);

  for (let attempt = 1; ; attempt++) {
    const { canceled, data: results } = await data.transaction
      .write(({ session, booking }) => [
        session
          .patch({ tenantId, classId, startsAt })
          .add({ booked: 1 })
          .where(
            (a, op) =>
              `${op.name(a.booked)} < ${op.name(a.capacity)} AND ${op.eq(a.cancelled, false)}`,
          )
          .commit(),
        booking
          .create({
            tenantId,
            sessionId,
            userId,
            bookingId: input.bookingId,
            classId,
            startsAt,
            createdAt: input.createdAt,
          })
          .commit(),
      ])
      .go();
    if (!canceled) return { kind: 'booked', sessionId, bookingId: input.bookingId };

    const [seat, record] = results;
    if (record?.code === 'ConditionalCheckFailed')
      return { kind: 'rejected', reason: 'already-booked' };
    if (seat?.code === 'ConditionalCheckFailed') {
      // The condition fails alike for a full, cancelled or missing session; tell them apart.
      const current = await data.entities.session.get({ tenantId, classId, startsAt }).go();
      const s = current.data;
      return { kind: 'rejected', reason: s && !s.cancelled ? 'full' : 'unavailable' };
    }
    const conflict = results.some((r) => r.code === 'TransactionConflict');
    if (!conflict || attempt >= MAX_ATTEMPTS) {
      throw new Error(
        `Booking transaction failed: ${results.map((r) => r.code).join(', ')} (attempt ${attempt})`,
      );
    }
    // Jittered backoff so the contenders don't collide again in lockstep.
    await new Promise((r) => setTimeout(r, Math.random() * 20 * attempt));
  }
}
