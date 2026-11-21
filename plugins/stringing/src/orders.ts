export type OrderStatus = 'requested' | 'received' | 'strung' | 'ready' | 'collected' | 'cancelled';

export interface StringingOrder {
  id: string;
  userId: string;
  racket: string; // e.g. "Yonex Astrox 88D"
  stringId: string;
  tensionLbs: { mains: number; crosses: number };
  express: boolean;
  dropOff: string; // "next class" session id, or a drop-off point name
  status: OrderStatus;
  invoiceId: string | null;
  paid: boolean;
  history: Array<{ status: OrderStatus; at: string; by: string }>;
}

export interface StringOption {
  id: string;
  name: string; // "Yonex BG65"
  priceCents: number;
  inStock: boolean;
}

export interface StringingSettings {
  labourCents: number;
  expressSurchargeCents: number;
  minTensionLbs: number;
  maxTensionLbs: number;
  turnaroundDays: number;
  dropOffPoints: string[];
}

/** Allowed moves on the coach's order board. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  requested: ['received', 'cancelled'],
  received: ['strung', 'cancelled'],
  strung: ['ready'],
  ready: ['collected'],
  collected: [],
  cancelled: [],
};

export class OrderError extends Error {}

export function moveOrder(
  order: StringingOrder,
  to: OrderStatus,
  by: string,
  at: string,
): StringingOrder {
  if (!NEXT[order.status].includes(to)) {
    throw new OrderError(`Cannot move an order from ${order.status} to ${to}`);
  }
  return { ...order, status: to, history: [...order.history, { status: to, at, by }] };
}

export function priceOrder(
  stringOption: StringOption,
  express: boolean,
  settings: StringingSettings,
): { lines: Array<{ description: string; cents: number }>; totalCents: number } {
  const lines = [
    { description: stringOption.name, cents: stringOption.priceCents },
    { description: 'Labour', cents: settings.labourCents },
  ];
  if (express) lines.push({ description: 'Express', cents: settings.expressSurchargeCents });
  return { lines, totalCents: lines.reduce((s, l) => s + l.cents, 0) };
}

export function validateTension(
  t: { mains: number; crosses: number },
  settings: StringingSettings,
): string | null {
  for (const [k, v] of Object.entries(t)) {
    if (!Number.isFinite(v) || v < settings.minTensionLbs || v > settings.maxTensionLbs) {
      return `${k} tension must be between ${settings.minTensionLbs} and ${settings.maxTensionLbs} lbs`;
    }
  }
  return null;
}
