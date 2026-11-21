/**
 * AWS resources for local runs, created with the SDK (the emulator supports CloudFormation least
 * well, see docs/testing.md). Mirrors infra/lib/racket-club-stack.ts: keep them in step.
 */
import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import {
  CreateEventBusCommand,
  EventBridgeClient,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-eventbridge';
import { BucketAlreadyOwnedByYou, CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { CreateQueueCommand, GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';

export const localNames = {
  table: process.env.TABLE_NAME ?? 'racket-club-local',
  bus: 'racket-club-local',
  queue: 'racket-club-local-events',
  deadLetterQueue: 'racket-club-local-events-dlq',
  uploadsBucket: 'racket-club-local-uploads',
};

/** Refuse to run anywhere but a local emulator: these helpers create and delete resources. */
export function assertLocalEndpoint(): string {
  const url = process.env.AWS_ENDPOINT_URL;
  const host = url ? new URL(url).hostname : '';
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
    throw new Error(
      `AWS_ENDPOINT_URL must point at a local emulator (got "${url ?? ''}"). Run through ` +
        '`pnpm aws:env -- ...` or the pnpm scripts, which set it.',
    );
  }
  return url as string;
}

/** SDK clients for the emulator; endpoint, keys, region and CA come from `pnpm aws:env`. */
export function localClients() {
  assertLocalEndpoint();
  return {
    dynamodb: new DynamoDBClient({}),
    eventbridge: new EventBridgeClient({}),
    // The emulator returns real-looking queue URLs (sqs.<region>.amazonaws.com). By default the
    // SDK sends calls to the queue URL's host, which would reach real AWS.
    sqs: new SQSClient({ useQueueUrlAsEndpoint: false }),
    // The emulator only accepts path-style bucket addressing.
    s3: new S3Client({ forcePathStyle: true }),
  };
}

const ignore =
  (...types: Array<new (...args: never[]) => Error>) =>
  (err: unknown) => {
    if (!types.some((t) => err instanceof t)) throw err;
  };

/** Idempotent: safe to run before every test run and every `pnpm dev`. */
export async function createLocalResources() {
  const c = localClients();
  const key = (name: string) => [
    { AttributeName: `${name}pk`, KeyType: 'HASH' as const },
    { AttributeName: `${name}sk`, KeyType: 'RANGE' as const },
  ];
  const attrs = ['pk', 'sk', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'].map((AttributeName) => ({
    AttributeName,
    AttributeType: 'S' as const,
  }));

  await c.dynamodb
    .send(
      new CreateTableCommand({
        TableName: localNames.table,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: attrs,
        KeySchema: key(''),
        GlobalSecondaryIndexes: ['gsi1', 'gsi2'].map((IndexName) => ({
          IndexName,
          KeySchema: key(IndexName),
          Projection: { ProjectionType: 'ALL' },
        })),
        StreamSpecification: { StreamEnabled: true, StreamViewType: 'NEW_AND_OLD_IMAGES' },
      }),
    )
    .catch(ignore(ResourceInUseException));
  await waitUntilTableExists(
    { client: c.dynamodb, maxWaitTime: 30 },
    { TableName: localNames.table },
  );

  await c.eventbridge
    .send(new CreateEventBusCommand({ Name: localNames.bus }))
    .catch(ignore(ResourceAlreadyExistsException));

  // CreateQueue is idempotent when the attributes match.
  const dlq = await c.sqs.send(new CreateQueueCommand({ QueueName: localNames.deadLetterQueue }));
  const { Attributes } = await c.sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: dlq.QueueUrl, AttributeNames: ['QueueArn'] }),
  );
  await c.sqs.send(
    new CreateQueueCommand({
      QueueName: localNames.queue,
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: Attributes?.QueueArn,
          maxReceiveCount: '5',
        }),
      },
    }),
  );

  await c.s3
    .send(new CreateBucketCommand({ Bucket: localNames.uploadsBucket }))
    .catch(ignore(BucketAlreadyOwnedByYou));
}
