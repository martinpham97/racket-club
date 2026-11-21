import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SSMClient } from '@aws-sdk/client-ssm';
import config from '../../../racket-club.config';
import { createApp } from './app';
import { cognitoAuth, mockAuth } from './auth';
import { createDb } from './data/client';
import { dynamoSettingsStore } from './data/settings-store';
import { dynamoUserStore } from './data/user-store';
import { type GoogleSetup, googleSetup } from './google-sign-in';
import { defaultActivePlugins } from './plugins';
import { memorySettingsStore } from './settings-store';
import { memoryUserStore } from './users';

/** Wires the app for a given environment. Shared by the local server and the Lambda handler. */
export function buildApp(env: Record<string, string | undefined> = process.env) {
  const local = env.AUTH_MODE === 'mock';
  const defaults = { activePlugins: defaultActivePlugins(env) };
  // Without a table (unit tests, e2e) settings and users live in memory.
  const data = env.TABLE_NAME ? createDb(env.TABLE_NAME).data : null;
  return createApp({
    plugins: config.plugins,
    settings: data ? dynamoSettingsStore(data, defaults) : memorySettingsStore(defaults),
    users: data ? dynamoUserStore(data) : memoryUserStore(),
    googleSetup: googleSetupFromEnv(env),
    auth: local ? mockAuth : cognitoAuth,
    env,
  });
}

/** The stack sets these; without them (local dev) the setup step reports it is unavailable. */
export function googleSetupFromEnv(
  env: Record<string, string | undefined>,
): GoogleSetup | undefined {
  const { USER_POOL_ID, USER_POOL_CLIENT_ID, SSM_PREFIX } = env;
  if (!USER_POOL_ID || !USER_POOL_CLIENT_ID || !SSM_PREFIX) return undefined;
  return googleSetup({
    cognito: new CognitoIdentityProviderClient({}),
    ssm: new SSMClient({}),
    parameterPrefix: SSM_PREFIX,
    userPoolId: USER_POOL_ID,
    appClientId: USER_POOL_CLIENT_ID,
  });
}
