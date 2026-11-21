import { describe, expect, it } from 'vitest';
import {
  balanceDue,
  type Invoice,
  invoiceStatus,
  isOverdue,
  makeReference,
  recordPayment,
} from './invoice';
import { money } from './money';

const invoice = (): Invoice => ({
  id: 'inv1',
  reference: 'RC-0001',
  userId: 'u1',
  coachId: 'owner',
  currency: 'AUD',
  lines: [
    {
      description: 'Term 1 intermediate',
      amount: money(20000),
      source: { kind: 'term', ref: 't1' },
    },
    {
      description: 'Restring BG65',
      amount: money(3500),
      source: { kind: 'plugin', ref: 'stringing' },
    },
  ],
  payments: [],
  dueAt: '2026-12-01T00:00:00.000Z',
  voided: false,
});

const pay = (id: string, cents: number) => ({
  id,
  amount: money(cents),
  method: 'payid' as const,
  recordedBy: 'owner',
  recordedAt: '2026-11-20T00:00:00.000Z',
});

describe('invoices with manual payments', () => {
  it('moves from unpaid to part paid to paid', () => {
    let inv = invoice();
    expect(invoiceStatus(inv)).toBe('unpaid');
    inv = recordPayment(inv, pay('p1', 10000));
    expect(invoiceStatus(inv)).toBe('part_paid');
    expect(balanceDue(inv).cents).toBe(13500);
    inv = recordPayment(inv, pay('p2', 13500));
    expect(invoiceStatus(inv)).toBe('paid');
  });

  it('is idempotent for the same payment id', () => {
    const once = recordPayment(invoice(), pay('p1', 5000));
    const twice = recordPayment(once, pay('p1', 5000));
    expect(twice.payments).toHaveLength(1);
  });

  it('allows refunds as negative entries and detects overpayment', () => {
    let inv = recordPayment(invoice(), pay('p1', 25000));
    expect(invoiceStatus(inv)).toBe('overpaid');
    inv = recordPayment(inv, pay('r1', -1500));
    expect(invoiceStatus(inv)).toBe('paid');
  });

  it('refuses payments on void invoices and in another currency', () => {
    expect(() => recordPayment({ ...invoice(), voided: true }, pay('p1', 100))).toThrow();
    expect(() =>
      recordPayment(invoice(), { ...pay('p1', 100), amount: money(100, 'USD') }),
    ).toThrow();
  });

  it('knows when an invoice is overdue', () => {
    const inv = invoice();
    expect(isOverdue(inv, new Date('2026-11-30T00:00:00Z'))).toBe(false);
    expect(isOverdue(inv, new Date('2026-12-02T00:00:00Z'))).toBe(true);
    const paid = recordPayment(inv, pay('p1', 23500));
    expect(isOverdue(paid, new Date('2026-12-02T00:00:00Z'))).toBe(false);
  });

  it('makes short bank-transfer references', () => {
    expect(makeReference('rc', 42)).toBe('RC-0042');
    expect(makeReference('RC', 123456)).toBe('RC-3456');
  });
});
