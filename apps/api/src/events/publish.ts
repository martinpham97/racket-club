import { type EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { DomainEvent } from '@racket-club/core';

/** EventBridge `source` for core events and for events a plugin emits. */
export const CORE_SOURCE = 'racket-club.core';
export const pluginSource = (pluginId: string) => `racket-club.plugin.${pluginId}`;
/** Every source starts with this; the worker rule matches on it. */
export const SOURCE_PREFIX = 'racket-club.';

export type Publish = (source: string, events: DomainEvent[]) => Promise<void>;

/** PutEvents in batches of 10 (the API limit). Throws if any entry fails, so the caller retries. */
export function eventBridgePublisher(client: EventBridgeClient, busName: string): Publish {
  return async (source, events) => {
    for (let i = 0; i < events.length; i += 10) {
      const batch = events.slice(i, i + 10);
      const res = await client.send(
        new PutEventsCommand({
          Entries: batch.map((e) => ({
            EventBusName: busName,
            Source: source,
            DetailType: e.name,
            Detail: JSON.stringify(e),
            Time: new Date(e.occurredAt),
          })),
        }),
      );
      if (res.FailedEntryCount) {
        const codes = res.Entries?.map((x) => x.ErrorCode).filter(Boolean);
        throw new Error(
          `EventBridge rejected ${res.FailedEntryCount} event(s): ${codes?.join(', ')}`,
        );
      }
    }
  };
}
