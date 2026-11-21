import { randomUUID } from 'node:crypto';
import { fixedClock } from '@racket-club/core';
import { definePlugin, PluginRegistry } from '@racket-club/plugin-sdk';
import { createTestContext, makeEvent } from '@racket-club/plugin-sdk/testing';
import { describe, expect, it } from 'vitest';
import { localNames } from '../local-aws';
import { createDb } from './client';
import { dynamoIdempotencyStore } from './idempotency';

const db = createDb(localNames.table);
const clock = fixedClock('2026-12-01T00:00:00.000Z');

function counterPlugin(id: string) {
  const runs: string[] = [];
  const plugin = definePlugin({
    id,
    name: { en: id, vi: id },
    version: '0.1.0',
    requiresCore: '^0.1.0',
    hooks: {
      'booking.created': async (event) => {
        runs.push(event.id);
      },
    },
  });
  return { plugin, runs };
}

function setup() {
  const tenantId = `test-${randomUUID()}`;
  const a = counterPlugin('xp');
  const b = counterPlugin('coins');
  const registry = new PluginRegistry([a.plugin, b.plugin], '0.1.0');
  registry.activate('xp');
  registry.activate('coins');
  const idempotency = dynamoIdempotencyStore(db, tenantId, clock);
  const dispatch = (event: ReturnType<typeof makeEvent>) =>
    registry.dispatch(event, (p) => createTestContext(p), idempotency);
  return { a, b, dispatch, tenantId };
}

const booked = (id: string) =>
  makeEvent('booking.created', { bookingId: 'b1', sessionId: 's1', userId: 'u1' }, id);

describe('dynamoIdempotencyStore', () => {
  it('handles an event once however often it is delivered, in sequence or in parallel', async () => {
    const { a, b, dispatch } = setup();
    const event = booked(`evt-${randomUUID()}`);

    await dispatch(event);
    await dispatch(event); // SQS redelivery
    await Promise.all(Array.from({ length: 5 }, () => dispatch(event))); // concurrent workers

    expect(a.runs).toEqual([event.id]);
    expect(b.runs).toEqual([event.id]);
  });

  it('still handles a different event, and the same event id in another tenant', async () => {
    const first = setup();
    const id = `evt-${randomUUID()}`;
    await first.dispatch(booked(id));
    await first.dispatch(booked(`evt-${randomUUID()}`));
    expect(first.a.runs).toHaveLength(2);

    const other = setup();
    await other.dispatch(booked(id));
    expect(other.a.runs).toEqual([id]);
  });

  it('writes claims that expire through TTL', async () => {
    const tenantId = `test-${randomUUID()}`;
    const store = dynamoIdempotencyStore(db, tenantId, clock);
    expect(await store.claim('k')).toBe(true);
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    const item = await db.client.send(
      new GetCommand({ TableName: db.table, Key: { pk: `T#${tenantId}#IDEMP#k`, sk: 'IDEMP' } }),
    );
    expect(item.Item?.expiresAt).toBe(Date.parse('2026-12-08T00:00:00.000Z') / 1000);
  });
});
