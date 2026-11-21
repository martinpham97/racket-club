import type { Branding } from '@racket-club/core';
import type { SettingsStore } from '../settings-store';
import type { DataService } from './entities';

/** Per-tenant settings in one item (`T#<tenant>#TENANT` / `SETTINGS`). */
export function dynamoSettingsStore(
  data: DataService,
  defaults: { activePlugins?: string[] } = {},
): SettingsStore {
  const settings = data.entities.settings;
  const read = async (tenantId: string) => (await settings.get({ tenantId }).go()).data;
  return {
    async getBranding(tenantId) {
      return (await read(tenantId))?.branding as Partial<Branding> | undefined;
    },
    async saveBranding(tenantId, branding) {
      // Only the coach edits settings, so a read-merge-write is fine here (unlike seats or coins).
      const current = (await read(tenantId))?.branding as Partial<Branding> | undefined;
      await settings
        .upsert({ tenantId })
        .set({ branding: { ...current, ...branding } })
        .go();
    },
    async getActivePlugins(tenantId) {
      return (await read(tenantId))?.activePlugins ?? defaults.activePlugins ?? [];
    },
    async setActivePlugins(tenantId, ids) {
      await settings.upsert({ tenantId }).set({ activePlugins: ids }).go();
    },
  };
}
