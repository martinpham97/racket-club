import { randomUUID } from 'node:crypto';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import { definePlugin } from '@racket-club/plugin-sdk';
import { makeEvent } from '@racket-club/plugin-sdk/testing';
import { describe, expect, it } from 'vitest';
import gamification, { type LedgerEntry } from '../../../../plugins/gamification/src/index';
import { bookSeat } from '../data/bookings';
import { dynamoPluginStore } from '../data/plugin-store';
import { localClients, localNames, routeEventsToQueue } from '../local-aws';
import { createEventDeps } from './deps';
import { streamReader } from './local-loop';
import { handleDomainEvent, processQueueMessage, publishStreamRecords } from './worker';

const c = localClients();
const quiet = { info: () => {}, warn: () => {}, error: () => {} };
const pipelineDeps = {
  ...createEventDeps({ table: localNames.table, bus: localNames.bus, env: {} }),
  log: quiet,
};

async function poll<T>(attempt: () => Promise<T | undefined>, tries = 20): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const found = await attempt();
    if (found !== undefined) return found;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('timed out');
}

/** A queue receiving only this tenant's events, so tests never see each other's. */
async function queueForTenant(tenantId: string) {
  const name = `pipeline-${tenantId.slice(-8)}`;
  const { QueueUrl } = await c.sqs.send(new CreateQueueCommand({ QueueName: name }));
  const { Attributes } = await c.sqs.send(
    new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] }),
  );
  await routeEventsToQueue(c, {
    rule: name,
    queueUrl: QueueUrl,
    queueArn: Attributes?.QueueArn,
    pattern: { source: [{ prefix: 'racket-club.' }], detail: { tenantId: [tenantId] } },
  });
  return QueueUrl as string;
}

describe('domain events (stream -> EventBridge -> SQS -> worker)', () => {
  it('books a session and runs the gamification hook exactly once', async () => {
    // The real plugin, with a counter around its hook: its ledger dedupes on its own too, so
    // only counting calls shows the pipeline itself delivers once.
    let hookRuns = 0;
    const realHook = gamification.hooks?.['booking.created'];
    const counted = {
      ...gamification,
      hooks: {
        ...gamification.hooks,
        'booking.created': async (...args: Parameters<NonNullable<typeof realHook>>) => {
          hookRuns += 1;
          await realHook?.(...args);
        },
      },
    };
    const deps = { ...pipelineDeps, plugins: [counted] };
    const tenantId = `test-${randomUUID()}`;
    await deps.settings.setActivePlugins(tenantId, ['gamification']);
    const queueUrl = await queueForTenant(tenantId);
    const reader = streamReader(localNames.table, 'start');

    const classId = `class-${randomUUID()}`;
    const startsAt = '2026-12-07T07:00:00.000Z';
    await deps.db.data.entities.session
      .create({ tenantId, classId, startsAt, endsAt: startsAt, coachId: 'coach', capacity: 10 })
      .go();
    const booked = await bookSeat(deps.db.data, {
      tenantId,
      classId,
      startsAt,
      userId: 'linh',
      bookingId: randomUUID(),
      createdAt: startsAt,
    });
    expect(booked.kind).toBe('booked');

    // Publisher: our tenant's booking on the stream. Published twice, as when Lambda retries a batch.
    const ours = await poll(async () => {
      const mine = (await reader.next()).filter(
        (r) => (r.dynamodb?.NewImage?.tenantId as { S?: string } | undefined)?.S === tenantId,
      );
      return mine.length ? mine : undefined;
    });
    expect(await publishStreamRecords(ours, deps)).toBe(1); // the session insert makes no event
    await publishStreamRecords(ours, deps);

    // Worker: both copies arrive through the rule; each is also delivered twice by SQS.
    const messages = await poll(async () => {
      const r = await c.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
        }),
      );
      return r.Messages?.length ? r.Messages : undefined;
    });
    for (const m of messages) {
      expect(JSON.parse(m.Body ?? '{}')['detail-type']).toBe('booking.created');
      expect(await processQueueMessage(m.Body ?? '', deps)).toBe(true);
      expect(await processQueueMessage(m.Body ?? '', deps)).toBe(true);
    }

    const ledger = await dynamoPluginStore(deps.db, tenantId, 'gamification').get<LedgerEntry[]>(
      'ledger#linh',
    );
    expect(hookRuns).toBe(1);
    expect(ledger?.map((e) => [e.reason, e.xp, e.coins])).toEqual([['book', 2, 0]]);
  });

  it('retries a failed hook on redelivery, and only that hook', async () => {
    const tenantId = `test-${randomUUID()}`;
    let attempts = 0;
    const flaky = definePlugin({
      id: 'flaky',
      name: { en: 'Flaky', vi: 'Flaky' },
      version: '0.1.0',
      requiresCore: '^0.1.0',
      hooks: {
        'booking.created': async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('downstream timeout');
        },
      },
    });
    const withFlaky = { ...pipelineDeps, plugins: [flaky] };
    await pipelineDeps.settings.setActivePlugins(tenantId, ['flaky']);
    const event = {
      ...makeEvent(
        'booking.created',
        { bookingId: 'b', sessionId: 's', userId: 'u' },
        randomUUID(),
      ),
      tenantId,
    };

    expect(await handleDomainEvent(event, withFlaky)).toHaveLength(1);
    expect(await handleDomainEvent(event, withFlaky)).toEqual([]);
    expect(await handleDomainEvent(event, withFlaky)).toEqual([]);
    expect(attempts).toBe(2);
  });

  it('keeps plugins from emitting events outside their own name', async () => {
    const tenantId = `test-${randomUUID()}`;
    const spoof = definePlugin({
      id: 'spoof',
      name: { en: 'Spoof', vi: 'Spoof' },
      version: '0.1.0',
      requiresCore: '^0.1.0',
      permissions: ['events:emit'],
      hooks: {
        'booking.created': async (_e, ctx) => ctx.emit('payment.marked_paid', { amountCents: 1 }),
      },
    });
    await pipelineDeps.settings.setActivePlugins(tenantId, ['spoof']);
    const event = {
      ...makeEvent(
        'booking.created',
        { bookingId: 'b', sessionId: 's', userId: 'u' },
        randomUUID(),
      ),
      tenantId,
    };
    const [failure] = await handleDomainEvent(event, { ...pipelineDeps, plugins: [spoof] });
    expect(String(failure?.error)).toMatch(/can only emit "spoof\.\*" events/);
  });
});
