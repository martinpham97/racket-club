import config from '../../../racket-club.config';
import { createApp } from './app';
import { cognitoAuth, mockAuth } from './auth';
import { createDb } from './data/client';
import { dynamoSettingsStore } from './data/settings-store';
import { memorySettingsStore } from './settings-store';

/** Wires the app for a given environment. Shared by the local server and the Lambda handler. */
export function buildApp(env: Record<string, string | undefined> = process.env) {
  const local = env.AUTH_MODE === 'mock';
  // Local dev starts with two plugins on so there is something to see; a deployment starts bare.
  const defaults = { activePlugins: local ? ['stringing', 'gamification'] : [] };
  return createApp({
    plugins: config.plugins,
    // Without a table (unit tests, e2e) settings live in memory.
    settings: env.TABLE_NAME
      ? dynamoSettingsStore(createDb(env.TABLE_NAME).data, defaults)
      : memorySettingsStore(defaults),
    auth: local ? mockAuth : cognitoAuth,
    env,
  });
}
