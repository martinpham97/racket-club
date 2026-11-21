import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { systemClock } from '@racket-club/core';
import type { Logger } from '@racket-club/plugin-sdk';
import config from '../../../../racket-club.config';
import { createDb } from '../data/client';
import { dynamoSettingsStore } from '../data/settings-store';
import { defaultActivePlugins } from '../plugins';
import { eventBridgePublisher } from './publish';
import type { EventDeps } from './worker';

/** One JSON line per entry, which CloudWatch Logs can search. */
export const jsonLogger: Logger = {
  info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
  warn: (message, data) => console.warn(JSON.stringify({ level: 'warn', message, ...data })),
  error: (message, data) => console.error(JSON.stringify({ level: 'error', message, ...data })),
};

/** Publisher and worker wiring, shared by the Lambda handlers and the local event loop. */
export function createEventDeps(opts: {
  table: string;
  bus: string;
  env: Record<string, string | undefined>;
}): EventDeps {
  const db = createDb(opts.table);
  return {
    plugins: config.plugins,
    settings: dynamoSettingsStore(db.data, { activePlugins: defaultActivePlugins(opts.env) }),
    db,
    clock: systemClock,
    publish: eventBridgePublisher(new EventBridgeClient({}), opts.bus),
    log: jsonLogger,
  };
}

export function eventDepsFromEnv(env: Record<string, string | undefined>): EventDeps {
  const { TABLE_NAME: table, EVENT_BUS_NAME: bus } = env;
  if (!table || !bus) throw new Error('TABLE_NAME and EVENT_BUS_NAME must be set');
  return createEventDeps({ table, bus, env });
}
