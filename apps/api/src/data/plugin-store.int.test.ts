import { randomUUID } from 'node:crypto';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { localNames } from '../local-aws';
import { createDb } from './client';
import { dynamoPluginStore } from './plugin-store';

const db = createDb(localNames.table);

describe('dynamoPluginStore', () => {
  const tenantId = `test-${randomUUID()}`;
  const stringing = dynamoPluginStore(db, tenantId, 'stringing');
  const gamification = dynamoPluginStore(db, tenantId, 'gamification');

  it('stores and returns JSON values, and deletes them', async () => {
    const order = { id: 'o1', tension: 25, strings: ['BG65'], paid: false };
    await stringing.put('order#o1', order);
    expect(await stringing.get('order#o1')).toEqual(order);
    await stringing.delete('order#o1');
    expect(await stringing.get('order#o1')).toBeUndefined();
  });

  it("can't read another plugin's records, whatever key it asks for", async () => {
    await stringing.put('secret', { coins: 999 });
    expect(await gamification.get('secret')).toBeUndefined();
    // Keys that try to climb into another namespace stay inside the caller's own.
    for (const key of ['../stringing#secret', '#P#stringing#secret', 'stringing#secret']) {
      expect(await gamification.get(key)).toBeUndefined();
    }
    // A plugin whose id is a prefix of another's can't reach it either.
    const s = dynamoPluginStore(db, tenantId, 'st');
    expect(await s.get('ringing#secret')).toBeUndefined();
    expect(await stringing.get('secret')).toEqual({ coins: 999 });
  });

  it("can't read the same plugin's records in another tenant", async () => {
    await stringing.put('order#o2', { id: 'o2' });
    const otherTenant = dynamoPluginStore(db, `test-${randomUUID()}`, 'stringing');
    expect(await otherTenant.get('order#o2')).toBeUndefined();
  });

  it('writes only under T#<tenant>#P#<pluginId>#, never over core keys', async () => {
    await gamification.put('ledger#u1', [{ xp: 10 }]);
    const raw = await db.client.send(
      new GetCommand({
        TableName: db.table,
        Key: { pk: `T#${tenantId}#P#gamification#ledger#u1`, sk: 'DATA' },
      }),
    );
    expect(raw.Item?.value).toEqual([{ xp: 10 }]);

    const ours = await db.client.send(
      new ScanCommand({
        TableName: db.table,
        FilterExpression: 'pluginId = :p AND begins_with(pk, :t)',
        ExpressionAttributeValues: { ':p': 'gamification', ':t': `T#${tenantId}#` },
      }),
    );
    for (const item of ours.Items ?? []) {
      expect(item.pk).toMatch(new RegExp(`^T#${tenantId}#P#gamification#`));
    }
  });

  it('rejects invalid plugin ids and empty keys', async () => {
    expect(() => dynamoPluginStore(db, tenantId, 'Bad#Id')).toThrow();
    await expect(stringing.get('')).rejects.toThrow();
  });
});
