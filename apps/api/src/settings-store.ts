import type { Branding } from '@racket-club/core';

/**
 * Per-tenant settings. Phase 0 ships an in-memory store for local dev and tests;
 * the DynamoDB implementation (pk TENANT, sk SETTINGS) follows in the next step.
 */
export interface SettingsStore {
  getBranding(tenantId: string): Promise<Partial<Branding> | undefined>;
  saveBranding(tenantId: string, branding: Partial<Branding>): Promise<void>;
  getActivePlugins(tenantId: string): Promise<string[]>;
  setActivePlugins(tenantId: string, ids: string[]): Promise<void>;
}

export function memorySettingsStore(initial: { activePlugins?: string[] } = {}): SettingsStore {
  const branding = new Map<string, Partial<Branding>>();
  const plugins = new Map<string, string[]>();
  return {
    getBranding: async (t) => branding.get(t),
    saveBranding: async (t, b) => {
      branding.set(t, { ...branding.get(t), ...b });
    },
    getActivePlugins: async (t) => plugins.get(t) ?? initial.activePlugins ?? [],
    setActivePlugins: async (t, ids) => {
      plugins.set(t, ids);
    },
  };
}
