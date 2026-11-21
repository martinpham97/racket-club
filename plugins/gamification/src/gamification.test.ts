import { PluginRegistry } from '@racket-club/plugin-sdk';
import {
  createTestContext,
  makeEvent,
  memoryIdempotencyStore,
} from '@racket-club/plugin-sdk/testing';
import { describe, expect, it } from 'vitest';
import plugin, {
  ANCHORS,
  award,
  balanceOf,
  isSpecies,
  type LedgerEntry,
  levelForXp,
  purchase,
  type ShopItem,
  SPECIES,
  xpForLevel,
} from './index';

const entry = (id: string, xp: number, coins: number): LedgerEntry => ({
  id,
  userId: 'u1',
  xp,
  coins,
  reason: 'test',
  at: '2026-12-01T00:00:00Z',
});

const hat: ShopItem = {
  id: 'cap-red',
  name: { en: 'Red cap', vi: 'Mũ đỏ' },
  slot: 'headwear',
  priceCoins: 30,
  minLevel: 1,
};

describe('levels', () => {
  it('follows 50 x n^2', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(49)).toBe(0);
    expect(levelForXp(50)).toBe(1);
    expect(levelForXp(199)).toBe(1);
    expect(levelForXp(200)).toBe(2);
    expect(xpForLevel(3)).toBe(450);
  });
});

describe('ledger', () => {
  it('never awards the same event twice', () => {
    const a = award([], entry('e1#attend', 10, 5));
    const b = award(a.entries, entry('e1#attend', 10, 5));
    expect(b.added).toBe(false);
    expect(balanceOf(b.entries)).toEqual({ xp: 10, coins: 5, level: 0 });
  });
});

describe('shop', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  const rich = [entry('a', 60, 100)];

  it('buys an item and deducts coins', () => {
    const r = purchase(rich, [], hat, 'u1', now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(balanceOf(r.entries).coins).toBe(70);
      expect(r.inventory).toEqual(['cap-red']);
    }
  });

  it.each([
    [[entry('a', 10, 100)], [], hat, 'level-too-low'],
    [[entry('a', 60, 10)], [], hat, 'not-enough-coins'],
    [rich, ['cap-red'], hat, 'owned'],
    [rich, [], { ...hat, stock: 0 }, 'sold-out'],
    [rich, [], { ...hat, availableUntil: '2026-11-01T00:00:00Z' }, 'not-available'],
  ] as const)('refuses purchase %#', (entries, inv, item, reason) => {
    expect(purchase([...entries], [...inv], item, 'u1', now)).toEqual({ ok: false, reason });
  });
});

describe('avatar spec', () => {
  it('starts with chicken, cat and dog, each with anchors inside the 32px frame', () => {
    expect([...SPECIES]).toEqual(['chicken', 'cat', 'dog']);
    for (const s of SPECIES) {
      for (const [x, y] of Object.values(ANCHORS[s])) {
        expect(x >= 0 && x < 32 && y >= 0 && y < 32).toBe(true);
      }
    }
    expect(isSpecies('dog')).toBe(true);
    expect(isSpecies('dragon')).toBe(false);
  });
});

describe('gamification hooks', () => {
  it('awards attendance, levels up and notifies once', async () => {
    const ctx = createTestContext(plugin);
    await ctx.store.put('ledger#u1', [entry('old', 45, 0)]);
    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('gamification');
    const idem = memoryIdempotencyStore();
    const evt = makeEvent('session.attended', { sessionId: 's1', userId: 'u1' }, 'att-1');

    await reg.dispatch(evt, () => ctx, idem);
    await reg.dispatch(evt, () => ctx, idem);

    expect(balanceOf(ctx.data.get('ledger#u1') as LedgerEntry[])).toEqual({
      xp: 55,
      coins: 5,
      level: 1,
    });
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.emitted).toEqual([
      { name: 'gamification.level_up', payload: { userId: 'u1', level: 1 } },
    ]);
  });

  it('awards XP for booking a session, once per booking', async () => {
    const ctx = createTestContext(plugin);
    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('gamification');
    const idem = memoryIdempotencyStore();
    const booked = makeEvent('booking.created', { bookingId: 'b1', sessionId: 's1', userId: 'u1' });

    await reg.dispatch(booked, () => ctx, idem);
    await reg.dispatch(booked, () => ctx, idem);

    const ledger = ctx.data.get('ledger#u1') as LedgerEntry[];
    expect(ledger.map((e) => e.reason)).toEqual(['book']);
    expect(balanceOf(ledger)).toEqual({ xp: 2, coins: 0, level: 0 });
  });

  it('lets the coach turn the booking reward off', async () => {
    const ctx = createTestContext(plugin, { settings: { bookSession: { xp: 0, coins: 0 } } });
    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('gamification');
    await reg.dispatch(
      makeEvent('booking.created', { bookingId: 'b1', sessionId: 's1', userId: 'u1' }),
      () => ctx,
      memoryIdempotencyStore(),
    );
    expect(ctx.data.get('ledger#u1')).toBeUndefined();
  });

  it('awards coins for events from the stringing plugin', async () => {
    const ctx = createTestContext(plugin);
    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('gamification');
    await reg.dispatch(
      makeEvent('stringing.order.created', { orderId: 'o1', userId: 'u1' }),
      () => ctx,
      memoryIdempotencyStore(),
    );
    expect(balanceOf(ctx.data.get('ledger#u1') as LedgerEntry[]).coins).toBe(5);
  });

  it('only rewards on-time payments', async () => {
    const ctx = createTestContext(plugin);
    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('gamification');
    const late = makeEvent('payment.marked_paid', {
      invoiceId: 'i',
      userId: 'u1',
      amountCents: 1,
      onTime: false,
    });
    await reg.dispatch(late, () => ctx, memoryIdempotencyStore());
    expect(ctx.data.get('ledger#u1')).toBe(undefined);
  });
});
