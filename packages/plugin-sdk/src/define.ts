import type { PluginDefinition } from './types';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

export class PluginDefinitionError extends Error {
  constructor(pluginId: string, problem: string) {
    super(`Plugin "${pluginId}": ${problem}`);
    this.name = 'PluginDefinitionError';
  }
}

/**
 * Declare a plugin. Validates the manifest eagerly so a broken plugin fails the build,
 * not the coach's deployment.
 */
export function definePlugin<S = Record<string, never>>(
  def: PluginDefinition<S>,
): PluginDefinition<S> {
  if (!ID_PATTERN.test(def.id)) {
    throw new PluginDefinitionError(
      def.id,
      'id must be lowercase letters, digits and dashes (2-40 chars)',
    );
  }
  if (!def.name?.en || !def.name?.vi) {
    throw new PluginDefinitionError(def.id, 'name needs both "en" and "vi"');
  }
  if (!/^\d+\.\d+\.\d+/.test(def.version)) {
    throw new PluginDefinitionError(def.id, `version "${def.version}" is not semver`);
  }
  if (!/^[\^~]?\d+\.\d+\.\d+$/.test(def.requiresCore)) {
    throw new PluginDefinitionError(
      def.id,
      `requiresCore "${def.requiresCore}" must look like ^1.2.3`,
    );
  }
  if (def.theme && def.theme.id !== def.id) {
    throw new PluginDefinitionError(def.id, `theme id "${def.theme.id}" must match the plugin id`);
  }
  return def;
}

/** Minimal semver range check supporting exact, ^ and ~ (all we allow in requiresCore). */
export function satisfiesCore(range: string, coreVersion: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^[\^~]/, '')
      .split('.')
      .map(Number) as [number, number, number];
  const [rMaj, rMin, rPat] = parse(range);
  const [cMaj, cMin, cPat] = parse(coreVersion);
  const gte = cMaj > rMaj || (cMaj === rMaj && (cMin > rMin || (cMin === rMin && cPat >= rPat)));
  if (!gte) return false;
  if (range.startsWith('^')) {
    // ^0.x.y locks the minor version; ^1.x.y locks the major version
    return rMaj === 0 ? cMaj === 0 && cMin === rMin : cMaj === rMaj;
  }
  if (range.startsWith('~')) return cMaj === rMaj && cMin === rMin;
  return cMaj === rMaj && cMin === rMin && cPat === rPat;
}
