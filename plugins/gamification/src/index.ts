import type { DomainEvent } from '@racket-club/core';
import { definePlugin, type PluginContext, type SettingsSchema } from '@racket-club/plugin-sdk';
import { award, balanceOf, DEFAULT_RULES, type EarningRules, type LedgerEntry } from './ledger';

export * from './avatar';
export * from './ledger';

export const settingsSchema: SettingsSchema<EarningRules> = {
  parse(input) {
    const i = (input ?? {}) as Partial<EarningRules>;
    const rules: EarningRules = { ...DEFAULT_RULES, ...i };
    if (rules.levelFactor <= 0) throw new Error('levelFactor must be positive');
    return rules;
  },
};

const ledgerKey = (userId: string) => `ledger#${userId}`;

/** Award XP/coins for an event; notifies the student when they level up. */
async function awardFor(
  ctx: PluginContext<EarningRules>,
  event: DomainEvent,
  userId: string,
  amounts: { xp: number; coins: number },
  reason: string,
): Promise<void> {
  if (amounts.xp === 0 && amounts.coins === 0) return;
  const entries = (await ctx.store.get<LedgerEntry[]>(ledgerKey(userId))) ?? [];
  const before = balanceOf(entries, ctx.settings.levelFactor);
  const { entries: next, added } = award(entries, {
    id: `${event.id}#${reason}`,
    userId,
    ...amounts,
    reason,
    at: ctx.clock.now().toISOString(),
  });
  if (!added) return;
  await ctx.store.put(ledgerKey(userId), next);
  const after = balanceOf(next, ctx.settings.levelFactor);
  if (after.level > before.level) {
    await ctx.notify(userId, {
      type: 'gamification.level_up',
      title: { en: `Level ${after.level}!`, vi: `Cấp ${after.level}!` },
      body: { en: 'New items are waiting in the shop.', vi: 'Có vật phẩm mới trong cửa hàng.' },
      url: '/p/gamification',
    });
    await ctx.emit('gamification.level_up', { userId, level: after.level });
  }
}

export default definePlugin<EarningRules>({
  id: 'gamification',
  name: { en: 'Rewards and avatars', vi: 'Phần thưởng và nhân vật' },
  description: {
    en: 'Students earn XP and coins, level up a pixel-art animal and buy accessories.',
    vi: 'Học viên nhận XP và xu, lên cấp cho thú cưng pixel và mua phụ kiện.',
  },
  version: '0.1.0',
  requiresCore: '^0.1.0',
  permissions: ['notifications:send', 'events:emit', 'users:read'],
  settings: settingsSchema,
  hooks: {
    'booking.created': async (event, ctx) =>
      awardFor(ctx, event, event.payload.userId, ctx.settings.bookSession, 'book'),
    'session.attended': async (event, ctx) =>
      awardFor(ctx, event, event.payload.userId, ctx.settings.attend, 'attend'),
    'payment.marked_paid': async (event, ctx) => {
      if (event.payload.onTime) {
        await awardFor(ctx, event, event.payload.userId, ctx.settings.payOnTime, 'pay-on-time');
      }
    },
  },
  on: {
    // Emitted by the stringing plugin; ignored if that plugin is not active.
    'stringing.order.created': async (event, ctx) => {
      const p = event.payload as { userId: string };
      await awardFor(ctx, event, p.userId, ctx.settings.stringingOrder, 'stringing-order');
    },
  },
  filters: {
    'profile.tabs': { apply: (tabs) => [...tabs, { id: 'avatar', labelKey: 'gamification.tab' }] },
  },
  i18n: {
    en: async () => ({ tab: 'Avatar and rewards', shop: 'Shop', coins: 'Coins', level: 'Level' }),
    vi: async () => ({
      tab: 'Nhân vật và phần thưởng',
      shop: 'Cửa hàng',
      coins: 'Xu',
      level: 'Cấp',
    }),
  },
});
