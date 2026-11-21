/**
 * AWS resources for local runs, created with the SDK (the emulator supports CloudFormation least
 * well, see docs/testing.md). Mirrors infra/lib/racket-club-stack.ts: keep them in step.
 */
import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import {
  CreateEventBusCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-eventbridge';
import { BucketAlreadyOwnedByYou, CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  QueueDoesNotExist,
  SetQueueAttributesCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

export const localNames = {
  table: process.env.TABLE_NAME ?? 'racket-club-local',
  bus: 'racket-club-local',
  queue: 'racket-club-local-events',
  deadLetterQueue: 'racket-club-local-events-dlq',
  workerRule: 'racket-club-local-worker',
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
  // Idempotency claims expire through TTL. Setting it again when it's already on is an error.
  await c.dynamodb
    .send(
      new UpdateTimeToLiveCommand({
        TableName: localNames.table,
        TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      }),
    )
    .catch((err: Error) => {
      if (!/already enabled/i.test(err.message)) throw err;
    });

  await c.eventbridge
    .send(new CreateEventBusCommand({ Name: localNames.bus }))
    .catch(ignore(ResourceAlreadyExistsException));

  // Look a queue up before creating it, then set attributes: CreateQueue refuses an existing
  // queue unless every attribute passed matches it exactly (as in AWS), so a second run failed.
  const ensureQueue = async (QueueName: string) => {
    try {
      return (await c.sqs.send(new GetQueueUrlCommand({ QueueName }))).QueueUrl;
    } catch (err) {
      if (!(err instanceof QueueDoesNotExist)) throw err;
      return (await c.sqs.send(new CreateQueueCommand({ QueueName }))).QueueUrl;
    }
  };
  const queueArnOf = async (QueueUrl: string | undefined) =>
    (await c.sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] })))
      .Attributes?.QueueArn;
  const dlqUrl = await ensureQueue(localNames.deadLetterQueue);
  const queueUrl = await ensureQueue(localNames.queue);
  await c.sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: await queueArnOf(dlqUrl),
          maxReceiveCount: '5',
        }),
      },
    }),
  );
  const queueArn = await queueArnOf(queueUrl);
  await routeEventsToQueue(c, {
    rule: localNames.workerRule,
    queueUrl,
    queueArn,
    pattern: { source: [{ prefix: 'racket-club.' }] },
  });

  await c.s3
    .send(new CreateBucketCommand({ Bucket: localNames.uploadsBucket }))
    .catch(ignore(BucketAlreadyOwnedByYou));
}

/**
 * An EventBridge rule on the local bus that delivers matching events to an SQS queue, with the
 * queue policy that allows it (the emulator enforces queue policies, as AWS does).
 */
export async function routeEventsToQueue(
  c: ReturnType<typeof localClients>,
  opts: { rule: string; queueUrl?: string; queueArn?: string; pattern: object },
) {
  await c.sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: opts.queueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'events.amazonaws.com' },
              Action: 'sqs:SendMessage',
              Resource: opts.queueArn,
            },
          ],
        }),
      },
    }),
  );
  await c.eventbridge.send(
    new PutRuleCommand({
      Name: opts.rule,
      EventBusName: localNames.bus,
      EventPattern: JSON.stringify(opts.pattern),
    }),
  );
  await c.eventbridge.send(
    new PutTargetsCommand({
      Rule: opts.rule,
      EventBusName: localNames.bus,
      Targets: [{ Id: 'queue', Arn: opts.queueArn }],
    }),
  );
}
