import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PluginStore } from '@racket-club/plugin-sdk';
import type { Db } from './client';

const PLUGIN_ID = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * Where a plugin's key lives. The plugin id can't contain '#', and the plugin's own key always
 * comes after `P#<pluginId>#`, so no key one plugin chooses can reach another plugin's records,
 * another tenant's, or core data.
 */
export function pluginRecordKey(tenantId: string, pluginId: string, key: string) {
  if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id "${pluginId}"`);
  if (!key) throw new Error('Plugin store keys must not be empty');
  return { pk: `T#${tenantId}#P#${pluginId}#${key}`, sk: 'DATA' };
}

/** `ctx.store` for one plugin in one tenant. */
export function dynamoPluginStore(db: Db, tenantId: string, pluginId: string): PluginStore {
  if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id "${pluginId}"`);
  const Key = (key: string) => pluginRecordKey(tenantId, pluginId, key);
  return {
    async get<T>(key: string) {
      const res = await db.client.send(new GetCommand({ TableName: db.table, Key: Key(key) }));
      return res.Item?.value as T | undefined;
    },
    async put<T>(key: string, value: T) {
      await db.client.send(
        new PutCommand({ TableName: db.table, Item: { ...Key(key), pluginId, value } }),
      );
    },
    async delete(key: string) {
      await db.client.send(new DeleteCommand({ TableName: db.table, Key: Key(key) }));
    },
  };
}
