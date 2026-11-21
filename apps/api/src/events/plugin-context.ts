import type { Clock, DomainEvent } from '@racket-club/core';
import type {
  ContextFactory,
  Logger,
  Permission,
  PluginContext,
  PluginDefinition,
} from '@racket-club/plugin-sdk';
import type { Db } from '../data/client';
import { dynamoPluginStore } from '../data/plugin-store';
import { type Publish, pluginSource } from './publish';

export interface ContextDeps {
  db: Db;
  clock: Clock;
  publish: Publish;
  log: Logger;
}

/**
 * The context each plugin's hook gets while handling `event`. Plugins reach core only through
 * it, and only with the permissions their manifest declares.
 */
export function pluginContextsFor(event: DomainEvent, deps: ContextDeps): ContextFactory {
  return (plugin: PluginDefinition<unknown>): PluginContext<unknown> => {
    const allowed = new Set<Permission>(plugin.permissions ?? []);
    const need = (p: Permission) => {
      if (!allowed.has(p)) throw new Error(`Plugin "${plugin.id}" is missing permission "${p}"`);
    };
    const log: Logger = {
      info: (msg, data) => deps.log.info(`[${plugin.id}] ${msg}`, data),
      warn: (msg, data) => deps.log.warn(`[${plugin.id}] ${msg}`, data),
      error: (msg, data) => deps.log.error(`[${plugin.id}] ${msg}`, data),
    };
    let emitted = 0;
    return {
      pluginId: plugin.id,
      tenantId: event.tenantId,
      // The coach's saved plugin settings arrive with the admin settings form (Phase 1).
      settings: plugin.settings ? plugin.settings.parse({}) : {},
      clock: deps.clock,
      log,
      store: dynamoPluginStore(deps.db, event.tenantId, plugin.id),
      async notify(userId, message) {
        need('notifications:send');
        // Delivery (Web Push and the inbox) arrives with the notifier in Phase 1.
        log.info('notification', { userId, type: message.type });
      },
      async emit(name, payload) {
        need('events:emit');
        // A plugin can't pass its events off as core's or another plugin's.
        if (!name.startsWith(`${plugin.id}.`)) {
          throw new Error(
            `Plugin "${plugin.id}" can only emit "${plugin.id}.*" events, not "${name}"`,
          );
        }
        emitted += 1;
        await deps.publish(pluginSource(plugin.id), [
          {
            // Derived from the triggering event, so a retried hook emits the same event again
            // and downstream handlers skip it.
            id: `${event.id}/${plugin.id}/${emitted}`,
            name,
            tenantId: event.tenantId,
            occurredAt: deps.clock.now().toISOString(),
            payload,
          },
        ]);
      },
    };
  };
}
