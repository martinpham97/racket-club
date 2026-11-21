import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createEntities } from './entities';

export interface Db {
  client: DynamoDBDocumentClient;
  table: string;
  data: ReturnType<typeof createEntities>;
}

/** Endpoint, region and credentials come from the environment (Lambda, or `pnpm aws:env`). */
export function createDb(table: string): Db {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { client, table, data: createEntities(client, table) };
}
