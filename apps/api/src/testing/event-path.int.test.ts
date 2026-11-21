import { randomUUID } from 'node:crypto';
import {
  DescribeTableCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import {
  type _Record,
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from '@aws-sdk/client-dynamodb-streams';
import {
  DeleteRuleCommand,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { afterAll, describe, expect, it } from 'vitest';
import { localClients, localNames } from './local-aws';

const c = localClients();
const streams = new DynamoDBStreamsClient({});
const runId = randomUUID();
const short = runId.slice(0, 8);

async function poll<T>(attempt: () => Promise<T | undefined>, tries = 20): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const found = await attempt();
    if (found !== undefined) return found;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('timed out');
}

/** Stand-in for the stream publisher Lambda (task 0.4): find our record on the table's stream. */
async function streamRecordFor(pk: string, sk: string): Promise<_Record> {
  const table = await c.dynamodb.send(new DescribeTableCommand({ TableName: localNames.table }));
  const StreamArn = table.Table?.LatestStreamArn;
  expect(StreamArn).toBeTruthy();
  const { StreamDescription } = await streams.send(new DescribeStreamCommand({ StreamArn }));
  const iterators = await Promise.all(
    (StreamDescription?.Shards ?? []).map(async ({ ShardId }) => {
      const it = await streams.send(
        new GetShardIteratorCommand({ StreamArn, ShardId, ShardIteratorType: 'TRIM_HORIZON' }),
      );
      return it.ShardIterator;
    }),
  );
  const seen: _Record[] = [];
  return poll(async () => {
    for (const [i, iterator] of iterators.entries()) {
      if (!iterator) continue;
      const page = await streams.send(new GetRecordsCommand({ ShardIterator: iterator }));
      iterators[i] = page.NextShardIterator;
      seen.push(...(page.Records ?? []));
    }
    return seen.find((r) => r.dynamodb?.Keys?.pk?.S === pk && r.dynamodb?.Keys?.sk?.S === sk);
  });
}

describe('local AWS (AWS Emulator)', () => {
  const ruleName = `event-path-${short}`;
  let queueUrl: string | undefined;

  afterAll(async () => {
    await c.eventbridge
      .send(new RemoveTargetsCommand({ Rule: ruleName, EventBusName: localNames.bus, Ids: ['q'] }))
      .catch(() => {});
    await c.eventbridge
      .send(new DeleteRuleCommand({ Name: ruleName, EventBusName: localNames.bus }))
      .catch(() => {});
    if (queueUrl) await c.sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
  });

  it('serves the table with its GSIs', async () => {
    const item = {
      pk: { S: `T#default#TEST#${runId}` },
      sk: { S: 'GSI' },
      gsi1pk: { S: `T#default#TESTGSI#${runId}` },
      gsi1sk: { S: 'A' },
    };
    await c.dynamodb.send(new PutItemCommand({ TableName: localNames.table, Item: item }));
    const got = await c.dynamodb.send(
      new GetItemCommand({ TableName: localNames.table, Key: { pk: item.pk, sk: item.sk } }),
    );
    expect(got.Item?.gsi1pk?.S).toBe(item.gsi1pk.S);
    const byIndex = await poll(async () => {
      const q = await c.dynamodb.send(
        new QueryCommand({
          TableName: localNames.table,
          IndexName: 'gsi1',
          KeyConditionExpression: 'gsi1pk = :p',
          ExpressionAttributeValues: { ':p': item.gsi1pk },
        }),
      );
      return q.Items?.length ? q.Items : undefined;
    });
    expect(byIndex).toHaveLength(1);
  });

  it('carries a DynamoDB write to SQS through the stream and EventBridge', async () => {
    // A queue and rule of our own, so reruns against a long-lived emulator never see stale messages.
    const queue = await c.sqs.send(new CreateQueueCommand({ QueueName: `event-path-${short}` }));
    queueUrl = queue.QueueUrl;
    const { Attributes } = await c.sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }),
    );
    // As in AWS (CDK adds this with the rule target), and the emulator enforces it too.
    await c.sqs.send(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'events.amazonaws.com' },
                Action: 'sqs:SendMessage',
                Resource: Attributes?.QueueArn,
              },
            ],
          }),
        },
      }),
    );
    await c.eventbridge.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName: localNames.bus,
        EventPattern: JSON.stringify({ source: ['racket-club.test'], detail: { runId: [runId] } }),
      }),
    );
    await c.eventbridge.send(
      new PutTargetsCommand({
        Rule: ruleName,
        EventBusName: localNames.bus,
        Targets: [{ Id: 'q', Arn: Attributes?.QueueArn }],
      }),
    );

    const pk = `T#default#TEST#${runId}`;
    await c.dynamodb.send(
      new PutItemCommand({
        TableName: localNames.table,
        Item: { pk: { S: pk }, sk: { S: 'EVENT' }, note: { S: 'hello' } },
      }),
    );

    const record = await streamRecordFor(pk, 'EVENT');
    expect(record.eventName).toBe('INSERT');
    expect(record.dynamodb?.NewImage?.note?.S).toBe('hello');

    const put = await c.eventbridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: localNames.bus,
            Source: 'racket-club.test',
            DetailType: 'item.inserted',
            Detail: JSON.stringify({ runId, pk, eventName: record.eventName }),
          },
        ],
      }),
    );
    expect(put.FailedEntryCount).toBe(0);

    const delivered = await poll(async () => {
      const r = await c.sqs.send(
        new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
      );
      return r.Messages?.[0];
    });
    const event = JSON.parse(delivered.Body ?? '{}');
    expect(event['detail-type']).toBe('item.inserted');
    expect(event.detail).toEqual({ runId, pk, eventName: 'INSERT' });
  });
});
