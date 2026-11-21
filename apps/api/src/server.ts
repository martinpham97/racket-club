import config from '../../../racket-club.config';
import { createApp } from './app';
import { cognitoAuth, mockAuth } from './auth';
import { memorySettingsStore } from './settings-store';

/** Wires the app for a given environment. Shared by the local server and the Lambda handler. */
export function buildApp(env: Record<string, string | undefined> = process.env) {
  const local = env.AUTH_MODE === 'mock';
  return createApp({
    plugins: config.plugins,
    // TODO(phase 0, step 7): DynamoDB-backed settings store when TABLE_NAME is set.
    settings: memorySettingsStore({ activePlugins: local ? ['stringing', 'gamification'] : [] }),
    auth: local ? mockAuth : cognitoAuth,
    env,
  });
}
