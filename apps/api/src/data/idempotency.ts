import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Clock } from '@racket-club/core';
import type { IdempotencyStore } from '@racket-club/plugin-sdk';
import type { Db } from './client';

/** Long enough to outlast every SQS/EventBridge retry of the same event. */
const KEEP_DAYS = 7;

/**
 * First claim of a key wins, across retries and concurrent workers: a conditional put on
 * `T#<tenant>#IDEMP#<key>`. Old claims expire through the table's TTL (`expiresAt`).
 */
export function dynamoIdempotencyStore(db: Db, tenantId: string, clock: Clock): IdempotencyStore {
  const Key = (key: string) => ({ pk: `T#${tenantId}#IDEMP#${key}`, sk: 'IDEMP' });
  return {
    async claim(key) {
      const now = clock.now();
      try {
        await db.client.send(
          new PutCommand({
            TableName: db.table,
            Item: {
              ...Key(key),
              claimedAt: now.toISOString(),
              expiresAt: Math.floor(now.getTime() / 1000) + KEEP_DAYS * 24 * 3600,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) return false;
        throw err;
      }
    },
    async release(key) {
      await db.client.send(new DeleteCommand({ TableName: db.table, Key: Key(key) }));
    },
  };
}
