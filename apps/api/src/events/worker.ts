import type { Clock, DomainEvent } from '@racket-club/core';
import type { HookFailure, Logger } from '@racket-club/plugin-sdk';
import type { Db } from '../data/client';
import { dynamoIdempotencyStore } from '../data/idempotency';
import { type AnyPlugin, registryFor } from '../plugins';
import type { SettingsStore } from '../settings-store';
import { domainEventsFrom, type StreamRecord } from './from-stream';
import { pluginContextsFor } from './plugin-context';
import { CORE_SOURCE, type Publish } from './publish';

export interface EventDeps {
  plugins: AnyPlugin[];
  settings: SettingsStore;
  db: Db;
  clock: Clock;
  publish: Publish;
  log: Logger;
}

/** Publisher: table changes (stream records) become domain events on the bus. */
export async function publishStreamRecords(
  records: StreamRecord[],
  deps: Pick<EventDeps, 'publish'>,
) {
  const events = records.flatMap(domainEventsFrom);
  if (events.length) await deps.publish(CORE_SOURCE, events);
  return events.length;
}

/**
 * Worker: run the hooks of the plugins this event's tenant has switched on. Returns the hooks
 * that failed; the caller hands the message back to the queue so those (and only those) rerun.
 */
export async function handleDomainEvent(
  event: DomainEvent,
  deps: EventDeps,
): Promise<HookFailure[]> {
  const registry = await registryFor(deps.plugins, deps.settings, event.tenantId);
  const failures = await registry.dispatch(
    event,
    pluginContextsFor(event, deps),
    dynamoIdempotencyStore(deps.db, event.tenantId, deps.clock),
  );
  for (const f of failures) {
    deps.log.error('plugin hook failed', {
      pluginId: f.pluginId,
      eventId: f.eventId,
      event: event.name,
      error: f.error instanceof Error ? f.error.message : String(f.error),
    });
  }
  return failures;
}

/**
 * One queue message, as the worker Lambda and the local loop both handle it. `true` means done
 * (delete it); `false` means hand it back for redelivery, and after five tries the dead-letter
 * queue keeps it.
 */
export async function processQueueMessage(body: string, deps: EventDeps): Promise<boolean> {
  try {
    return (await handleDomainEvent(eventFromQueueMessage(body), deps)).length === 0;
  } catch (err) {
    deps.log.error('queue message failed', { error: (err as Error).message });
    return false;
  }
}

/** An SQS message body as EventBridge delivers it: the event is in `detail`. */
export function eventFromQueueMessage(body: string): DomainEvent {
  const envelope = JSON.parse(body) as { detail?: DomainEvent };
  const event = envelope.detail;
  if (!event?.id || !event.name || !event.tenantId) {
    throw new Error('Queue message is not a domain event from EventBridge');
  }
  return event;
}
