import { PluginRegistry } from '@racket-club/plugin-sdk';
import {
  createTestContext,
  makeEvent,
  memoryIdempotencyStore,
} from '@racket-club/plugin-sdk/testing';
import { describe, expect, it } from 'vitest';
import plugin, {
  moveOrder,
  OrderError,
  priceOrder,
  type StringingOrder,
  settingsSchema,
  validateTension,
} from './index';

const settings = settingsSchema.parse({});
const order = (): StringingOrder => ({
  id: 'o1',
  userId: 'u1',
  racket: 'Yonex Astrox 88D',
  stringId: 'bg65',
  tensionLbs: { mains: 24, crosses: 25 },
  express: false,
  dropOff: 'At my next class',
  status: 'requested',
  invoiceId: 'inv1',
  paid: false,
  history: [],
});

describe('stringing orders', () => {
  it('follows the board from requested to collected', () => {
    let o = order();
    for (const s of ['received', 'strung', 'ready', 'collected'] as const) {
      o = moveOrder(o, s, 'owner', '2026-12-01T00:00:00Z');
    }
    expect(o.status).toBe('collected');
    expect(o.history).toHaveLength(4);
  });

  it('blocks skipping steps and cancelling after stringing', () => {
    expect(() => moveOrder(order(), 'ready', 'owner', 'now')).toThrow(OrderError);
    const strung = { ...order(), status: 'strung' as const };
    expect(() => moveOrder(strung, 'cancelled', 'owner', 'now')).toThrow(OrderError);
  });

  it('prices string, labour and express', () => {
    const p = priceOrder(
      { id: 'bg65', name: 'Yonex BG65', priceCents: 1200, inStock: true },
      true,
      settings,
    );
    expect(p.totalCents).toBe(1200 + 1500 + 1000);
    expect(p.lines).toHaveLength(3);
  });

  it('validates tension against settings', () => {
    expect(validateTension({ mains: 24, crosses: 25 }, settings)).toBeNull();
    expect(validateTension({ mains: 40, crosses: 25 }, settings)).toContain('mains');
  });

  it('rejects inconsistent settings', () => {
    expect(() => settingsSchema.parse({ minTensionLbs: 30, maxTensionLbs: 20 })).toThrow();
  });
});

describe('stringing plugin hooks', () => {
  it('marks the order paid when its invoice is paid, once', async () => {
    const ctx = createTestContext(plugin);
    await ctx.store.put('invoice#inv1', 'o1');
    await ctx.store.put('order#o1', order());

    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('stringing');
    const evt = makeEvent('payment.marked_paid', {
      invoiceId: 'inv1',
      userId: 'u1',
      amountCents: 2700,
      onTime: true,
    });
    const failures = await reg.dispatch(evt, () => ctx, memoryIdempotencyStore());

    expect(failures).toEqual([]);
    expect((ctx.data.get('order#o1') as StringingOrder).paid).toBe(true);
  });

  it('has complete translations', async () => {
    const en = await plugin.i18n?.en?.();
    const vi = await plugin.i18n?.vi?.();
    expect(Object.keys(vi ?? {})).toEqual(Object.keys(en ?? {}));
  });
});
