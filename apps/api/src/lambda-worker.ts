import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { eventDepsFromEnv } from './events/deps';
import { processQueueMessage } from './events/worker';

const deps = eventDepsFromEnv(process.env);

/** Domain events from the queue to plugin hooks. Failed messages go back to SQS to retry. */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    if (!(await processQueueMessage(record.body, deps))) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
