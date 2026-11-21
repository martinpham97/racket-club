/**
 * Local stand-in for the publisher and worker Lambdas (the emulator doesn't run our Lambdas).
 * It polls the table's stream and the worker queue in the AWS Emulator and calls the same code
 * the Lambdas do, so retries, redelivery and the dead-letter queue behave as in AWS.
 */
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from '@aws-sdk/client-dynamodb-streams';
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { StreamRecord } from './from-stream';
import { type EventDeps, processQueueMessage, publishStreamRecords } from './worker';

/**
 * Reads a table's stream shard by shard. `from: 'latest'` skips what is already there (dev
 * server start); 'start' reads everything (tests). Shards that appear later are read in full.
 */
export function streamReader(table: string, from: 'latest' | 'start') {
  const dynamodb = new DynamoDBClient({});
  const streams = new DynamoDBStreamsClient({});
  const iterators = new Map<string, string | undefined>();
  let streamArn: string | undefined;
  let first = true;

  async function discover() {
    if (!streamArn) {
      const t = await dynamodb.send(new DescribeTableCommand({ TableName: table }));
      streamArn = t.Table?.LatestStreamArn;
      if (!streamArn) throw new Error(`Table ${table} has no stream`);
    }
    const { StreamDescription } = await streams.send(
      new DescribeStreamCommand({ StreamArn: streamArn }),
    );
    for (const { ShardId } of StreamDescription?.Shards ?? []) {
      if (!ShardId || iterators.has(ShardId)) continue;
      const type = first && from === 'latest' ? 'LATEST' : 'TRIM_HORIZON';
      const it = await streams.send(
        new GetShardIteratorCommand({ StreamArn: streamArn, ShardId, ShardIteratorType: type }),
      );
      iterators.set(ShardId, it.ShardIterator);
    }
    first = false;
  }

  return {
    async next(): Promise<StreamRecord[]> {
      await discover();
      const out: StreamRecord[] = [];
      for (const [shard, iterator] of iterators) {
        if (!iterator) continue; // closed shard
        const page = await streams.send(new GetRecordsCommand({ ShardIterator: iterator }));
        iterators.set(shard, page.NextShardIterator);
        out.push(...((page.Records ?? []) as StreamRecord[]));
      }
      return out;
    },
  };
}

/** Receive, process, and delete what succeeded; failures reappear after the visibility timeout. */
export async function drainQueueOnce(sqs: SQSClient, queueUrl: string, deps: EventDeps) {
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 1,
      VisibilityTimeout: 5,
    }),
  );
  let done = 0;
  for (const m of res.Messages ?? []) {
    if (await processQueueMessage(m.Body ?? '', deps)) {
      await sqs.send(
        new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle }),
      );
      done++;
    }
  }
  return { received: res.Messages?.length ?? 0, done };
}

export function startLocalEventLoop(deps: EventDeps, opts: { table: string; queue: string }) {
  // The emulator's queue URLs point at real AWS unless the SDK is told not to use them.
  const sqs = new SQSClient({ useQueueUrlAsEndpoint: false });
  const reader = streamReader(opts.table, 'latest');
  let running = true;

  const loop = async (name: string, step: () => Promise<unknown>, pauseMs: number) => {
    while (running) {
      try {
        await step();
      } catch (err) {
        deps.log.error(`local ${name} loop`, { error: (err as Error).message });
        await new Promise((r) => setTimeout(r, 2000));
      }
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  };

  const started = (async () => {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: opts.queue }));
    if (!QueueUrl) throw new Error(`No queue ${opts.queue}`);
    await Promise.all([
      loop('publisher', async () => publishStreamRecords(await reader.next(), deps), 250),
      loop('worker', () => drainQueueOnce(sqs, QueueUrl, deps), 0),
    ]);
  })();

  return {
    stop() {
      running = false;
      return started;
    },
  };
}
