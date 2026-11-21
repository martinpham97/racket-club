import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { CoreEventMap, CoreEventName, DomainEvent } from '@racket-club/core';

/**
 * A DynamoDB stream record in the shape both sources share: the Lambda event source and the
 * DynamoDB Streams API (which the local runner polls). Images are in DynamoDB JSON.
 */
export interface StreamRecord {
  eventID?: string;
  eventName?: 'INSERT' | 'MODIFY' | 'REMOVE' | string;
  dynamodb?: {
    NewImage?: Record<string, unknown>;
    OldImage?: Record<string, unknown>;
    /** Seconds since epoch from Lambda; a Date from the Streams API. */
    ApproximateCreationDateTime?: number | Date;
  };
}

type Item = Record<string, unknown>;
type CoreEvent = { [N in CoreEventName]: DomainEvent<N, CoreEventMap[N]> }[CoreEventName];

const image = (img: Record<string, unknown> | undefined): Item | undefined =>
  img ? unmarshall(img as Parameters<typeof unmarshall>[0]) : undefined;

const str = (item: Item, key: string) => String(item[key] ?? '');

/**
 * The domain events one table change stands for. Only core entities (marked by ElectroDB's
 * `__edb_e__`) produce events; plugin records, settings and idempotency claims don't.
 * The event id is the stream record's id, so a redelivered record is the same event.
 */
export function domainEventsFrom(record: StreamRecord): CoreEvent[] {
  const after = image(record.dynamodb?.NewImage);
  const before = image(record.dynamodb?.OldImage);
  const item = after ?? before;
  if (!item || !record.eventID) return [];

  const at = record.dynamodb?.ApproximateCreationDateTime;
  const occurredAt = (
    at instanceof Date ? at : new Date(typeof at === 'number' ? at * 1000 : 0)
  ).toISOString();
  const base = { id: record.eventID, tenantId: str(item, 'tenantId'), occurredAt };
  const entity = item.__edb_e__;

  if (record.eventName === 'INSERT' && after) {
    if (entity === 'booking') {
      return [
        {
          ...base,
          name: 'booking.created',
          payload: {
            bookingId: str(after, 'bookingId'),
            sessionId: str(after, 'sessionId'),
            userId: str(after, 'userId'),
          },
        },
      ];
    }
    if (entity === 'user') {
      return [
        {
          ...base,
          name: 'user.registered',
          payload: { userId: str(after, 'userId'), locale: after.locale === 'vi' ? 'vi' : 'en' },
        },
      ];
    }
    if (entity === 'invoice') {
      return [
        {
          ...base,
          name: 'invoice.created',
          payload: {
            invoiceId: str(after, 'invoiceId'),
            userId: str(after, 'userId'),
            totalCents: Number(after.totalCents ?? 0),
          },
        },
      ];
    }
  }
  if (record.eventName === 'REMOVE' && before && entity === 'booking') {
    return [
      {
        ...base,
        name: 'booking.cancelled',
        payload: {
          bookingId: str(before, 'bookingId'),
          sessionId: str(before, 'sessionId'),
          userId: str(before, 'userId'),
          // Waitlist promotion arrives with cancellations in Phase 1.
          promotedUserId: null,
        },
      },
    ];
  }
  return [];
}
