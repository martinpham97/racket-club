import { marshall } from '@aws-sdk/util-dynamodb';
import { describe, expect, it } from 'vitest';
import { domainEventsFrom, type StreamRecord } from './from-stream';

const booking = {
  pk: 'T#default#SESSION#beginners_2026-12-07T07:00:00.000Z',
  sk: 'BOOKING#u1',
  __edb_e__: 'booking',
  __edb_v__: '1',
  tenantId: 'default',
  bookingId: 'b1',
  sessionId: 'beginners_2026-12-07T07:00:00.000Z',
  userId: 'u1',
};

const record = (
  eventName: string,
  images: { new?: object; old?: object },
  at: number | Date = 1_796_000_000,
): StreamRecord => ({
  eventID: 'rec-1',
  eventName,
  dynamodb: {
    NewImage: images.new ? marshall(images.new) : undefined,
    OldImage: images.old ? marshall(images.old) : undefined,
    ApproximateCreationDateTime: at,
  },
});

describe('domainEventsFrom', () => {
  it('turns a new booking into booking.created, keyed by the stream record', () => {
    expect(domainEventsFrom(record('INSERT', { new: booking }))).toEqual([
      {
        id: 'rec-1',
        name: 'booking.created',
        tenantId: 'default',
        occurredAt: new Date(1_796_000_000_000).toISOString(),
        payload: { bookingId: 'b1', sessionId: booking.sessionId, userId: 'u1' },
      },
    ]);
  });

  it('accepts the Date timestamps the DynamoDB Streams API returns', () => {
    const at = new Date('2026-12-01T10:00:00.000Z');
    expect(domainEventsFrom(record('INSERT', { new: booking }, at))[0]?.occurredAt).toBe(
      '2026-12-01T10:00:00.000Z',
    );
  });

  it('turns a deleted booking into booking.cancelled', () => {
    const [event] = domainEventsFrom(record('REMOVE', { old: booking }));
    expect(event?.name).toBe('booking.cancelled');
    expect(event?.payload).toEqual({
      bookingId: 'b1',
      sessionId: booking.sessionId,
      userId: 'u1',
      promotedUserId: null,
    });
  });

  it('turns new users and invoices into user.registered and invoice.created', () => {
    const user = { __edb_e__: 'user', tenantId: 't', userId: 'u2', locale: 'vi' };
    const invoice = {
      __edb_e__: 'invoice',
      tenantId: 't',
      invoiceId: 'i1',
      userId: 'u2',
      totalCents: 25000,
    };
    expect(domainEventsFrom(record('INSERT', { new: user }))[0]).toMatchObject({
      name: 'user.registered',
      tenantId: 't',
      payload: { userId: 'u2', locale: 'vi' },
    });
    expect(domainEventsFrom(record('INSERT', { new: invoice }))[0]).toMatchObject({
      name: 'invoice.created',
      payload: { invoiceId: 'i1', userId: 'u2', totalCents: 25000 },
    });
  });

  it('ignores updates, plugin records, settings and idempotency claims', () => {
    expect(domainEventsFrom(record('MODIFY', { new: booking, old: booking }))).toEqual([]);
    for (const item of [
      { pk: 'T#default#P#gamification#ledger#u1', sk: 'DATA', value: [] },
      { pk: 'T#default#IDEMP#x', sk: 'IDEMP' },
      { __edb_e__: 'settings', tenantId: 'default' },
      { __edb_e__: 'session', tenantId: 'default' },
    ]) {
      expect(domainEventsFrom(record('INSERT', { new: item }))).toEqual([]);
    }
    expect(domainEventsFrom({ eventName: 'INSERT' })).toEqual([]);
  });
});
