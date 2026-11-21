import type { DynamoDBStreamEvent } from 'aws-lambda';
import { eventDepsFromEnv } from './events/deps';
import type { StreamRecord } from './events/from-stream';
import { publishStreamRecords } from './events/worker';

const deps = eventDepsFromEnv(process.env);

/**
 * DynamoDB stream to EventBridge. Throwing makes Lambda retry the batch (split in half on each
 * error); events keep the stream record id, so a retried batch is deduplicated downstream.
 */
export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  await publishStreamRecords(event.Records as StreamRecord[], deps);
}
