import { type PluginDefinition, PluginRegistry } from '@racket-club/plugin-sdk';
import type { SettingsStore } from './settings-store';

export const CORE_VERSION = '0.1.0';

// biome-ignore lint/suspicious/noExplicitAny: plugins carry their own settings types
export type AnyPlugin = PluginDefinition<any>;

/** A registry reflecting which of the installed plugins this tenant has switched on. */
export async function registryFor(
  plugins: AnyPlugin[],
  settings: SettingsStore,
  tenantId: string,
): Promise<PluginRegistry> {
  const reg = new PluginRegistry(plugins, CORE_VERSION);
  for (const id of await settings.getActivePlugins(tenantId)) {
    if (reg.installed().some((p) => p.id === id)) reg.activate(id);
  }
  return reg;
}

/** Local dev starts with two plugins on so there is something to see; a deployment starts bare. */
export function defaultActivePlugins(env: Record<string, string | undefined>): string[] {
  return env.AUTH_MODE === 'mock' ? ['stringing', 'gamification'] : [];
}
