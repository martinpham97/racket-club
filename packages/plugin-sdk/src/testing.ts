/**
 * Test helpers for plugin authors: `import { createTestContext } from '@racket-club/plugin-sdk/testing'`.
 */
import { type DomainEvent, fixedClock } from '@racket-club/core';
import type { IdempotencyStore } from './registry';
import type { OutboundMessage, Permission, PluginContext, PluginDefinition } from './types';

export interface TestContext<S> extends PluginContext<S> {
  sent: Array<{ userId: string; message: OutboundMessage }>;
  emitted: Array<{ name: string; payload: unknown }>;
  data: Map<string, unknown>;
}

export function createTestContext<S>(
  plugin: Pick<PluginDefinition<S>, 'id' | 'permissions' | 'settings'>,
  opts: { settings?: unknown; now?: string; tenantId?: string } = {},
): TestContext<S> {
  const data = new Map<string, unknown>();
  const sent: TestContext<S>['sent'] = [];
  const emitted: TestContext<S>['emitted'] = [];
  const perms = new Set<Permission>(plugin.permissions ?? []);
  const need = (p: Permission) => {
    if (!perms.has(p)) throw new Error(`Plugin "${plugin.id}" is missing permission "${p}"`);
  };
  const settings = (plugin.settings ? plugin.settings.parse(opts.settings ?? {}) : {}) as S;

  return {
    pluginId: plugin.id,
    tenantId: opts.tenantId ?? 'default',
    settings,
    clock: fixedClock(opts.now ?? '2026-12-01T00:00:00.000Z'),
    log: { info: () => {}, warn: () => {}, error: () => {} },
    store: {
      get: async <T>(k: string) => data.get(k) as T | undefined,
      put: async (k, v) => {
        data.set(k, v);
      },
      delete: async (k) => {
        data.delete(k);
      },
    },
    notify: async (userId, message) => {
      need('notifications:send');
      sent.push({ userId, message });
    },
    emit: async (name, payload) => {
      need('events:emit');
      emitted.push({ name, payload });
    },
    sent,
    emitted,
    data,
  };
}

let seq = 0;
export function makeEvent<P>(name: string, payload: P, id?: string): DomainEvent<string, P> {
  seq += 1;
  return {
    id: id ?? `evt-${seq}`,
    name,
    tenantId: 'default',
    occurredAt: '2026-12-01T00:00:00.000Z',
    payload,
  };
}

export function memoryIdempotencyStore(): IdempotencyStore {
  const seen = new Set<string>();
  return {
    claim: async (key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}
