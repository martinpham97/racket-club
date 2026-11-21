import { type Money, money } from './money';

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'payid'
  | 'credit'
  | 'stripe'
  | 'payto'
  | 'other';

export interface InvoiceLine {
  description: string;
  amount: Money;
  source: { kind: 'session' | 'term' | 'plugin'; ref: string };
}

export interface PaymentEntry {
  id: string;
  amount: Money;
  method: PaymentMethod;
  recordedBy: string; // user id of the coach or staff, or 'system' for webhooks
  recordedAt: string;
  note?: string;
}

export interface Invoice {
  id: string;
  reference: string; // short code students put on bank transfers, e.g. RC-4821
  userId: string;
  coachId: string;
  currency: string;
  lines: InvoiceLine[];
  payments: PaymentEntry[]; // append-only ledger
  dueAt: string;
  voided: boolean;
}

export type InvoiceStatus = 'unpaid' | 'part_paid' | 'paid' | 'overpaid' | 'void';

export function invoiceTotal(inv: Invoice): Money {
  return money(
    inv.lines.reduce((sum, l) => sum + l.amount.cents, 0),
    inv.currency,
  );
}

export function amountPaid(inv: Invoice): Money {
  return money(
    inv.payments.reduce((sum, p) => sum + p.amount.cents, 0),
    inv.currency,
  );
}

export function balanceDue(inv: Invoice): Money {
  return money(invoiceTotal(inv).cents - amountPaid(inv).cents, inv.currency);
}

export function invoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.voided) return 'void';
  const balance = balanceDue(inv).cents;
  const paid = amountPaid(inv).cents;
  if (balance === 0) return 'paid';
  if (balance < 0) return 'overpaid';
  return paid > 0 ? 'part_paid' : 'unpaid';
}

export function isOverdue(inv: Invoice, now: Date): boolean {
  const status = invoiceStatus(inv);
  return (status === 'unpaid' || status === 'part_paid') && now.getTime() > Date.parse(inv.dueAt);
}

/** Coach marks a (part) payment. Returns a new invoice; the ledger is never edited in place. */
export function recordPayment(inv: Invoice, entry: PaymentEntry): Invoice {
  if (inv.voided) throw new Error('Cannot record a payment on a void invoice');
  if (entry.amount.currency !== inv.currency) throw new Error('Currency mismatch');
  if (entry.amount.cents === 0) throw new Error('Payment amount must not be zero');
  if (inv.payments.some((p) => p.id === entry.id)) return inv; // idempotent
  return { ...inv, payments: [...inv.payments, entry] };
}

/** Short, unambiguous reference for bank transfers: prefix + 4 digits. */
export function makeReference(prefix: string, seq: number): string {
  return `${prefix.toUpperCase()}-${String(seq % 10_000).padStart(4, '0')}`;
}
