/**
 * Domain events published on the EventBridge bus (and the in-process bus locally).
 * Plugins subscribe to these through `hooks` in definePlugin().
 */
export interface CoreEventMap {
  'user.registered': { userId: string; locale: 'en' | 'vi' };
  'booking.created': { bookingId: string; sessionId: string; userId: string };
  'booking.cancelled': {
    bookingId: string;
    sessionId: string;
    userId: string;
    promotedUserId: string | null;
  };
  'booking.waitlisted': { sessionId: string; userId: string; position: number };
  'session.attended': { sessionId: string; userId: string };
  'session.cancelled': { sessionId: string; affectedUserIds: string[] };
  'invoice.created': { invoiceId: string; userId: string; totalCents: number };
  'payment.marked_paid': {
    invoiceId: string;
    userId: string;
    amountCents: number;
    onTime: boolean;
  };
}

export type CoreEventName = keyof CoreEventMap;

export interface DomainEvent<N extends string = string, P = unknown> {
  /** Unique id; handlers use it for idempotency (an event retried never pays twice). */
  id: string;
  name: N;
  tenantId: string;
  occurredAt: string;
  payload: P;
}
