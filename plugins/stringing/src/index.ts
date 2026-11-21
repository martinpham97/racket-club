import { definePlugin, type SettingsSchema } from '@racket-club/plugin-sdk';
import type { StringingOrder, StringingSettings } from './orders';

export * from './orders';

/** Hand-written parser so the plugin has no extra dependency; a Zod schema works the same way. */
export const settingsSchema: SettingsSchema<StringingSettings> = {
  parse(input) {
    const i = (input ?? {}) as Partial<StringingSettings>;
    const s: StringingSettings = {
      labourCents: i.labourCents ?? 1500,
      expressSurchargeCents: i.expressSurchargeCents ?? 1000,
      minTensionLbs: i.minTensionLbs ?? 18,
      maxTensionLbs: i.maxTensionLbs ?? 35,
      turnaroundDays: i.turnaroundDays ?? 2,
      dropOffPoints: i.dropOffPoints ?? ['At my next class'],
    };
    if (s.minTensionLbs >= s.maxTensionLbs)
      throw new Error('minTensionLbs must be below maxTensionLbs');
    return s;
  },
};

export default definePlugin<StringingSettings>({
  id: 'stringing',
  name: { en: 'Stringing service', vi: 'Dịch vụ đan vợt' },
  description: {
    en: 'Students order racket restrings; the coach tracks them on a board.',
    vi: 'Học viên đặt đan lại vợt; huấn luyện viên theo dõi trên bảng.',
  },
  version: '0.1.0',
  requiresCore: '^0.1.0',
  permissions: ['payments:create-invoice', 'notifications:send', 'events:emit'],
  settings: settingsSchema,
  hooks: {
    // When the coach marks the order's invoice paid, flag the order as paid.
    'payment.marked_paid': async (event, ctx) => {
      const orderId = await ctx.store.get<string>(`invoice#${event.payload.invoiceId}`);
      if (!orderId) return;
      const order = await ctx.store.get<StringingOrder>(`order#${orderId}`);
      if (!order || order.paid) return;
      await ctx.store.put(`order#${orderId}`, { ...order, paid: true });
    },
  },
  filters: {
    'profile.tabs': { apply: (tabs) => [...tabs, { id: 'stringing', labelKey: 'stringing.tab' }] },
  },
  i18n: {
    en: async () => ({ tab: 'My restrings', ready: 'Your racket is ready to collect' }),
    vi: async () => ({ tab: 'Vợt đang đan', ready: 'Vợt của bạn đã sẵn sàng để nhận' }),
  },
});
