import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { systemClock } from '@racket-club/core';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { createDb } from './data/client';
import { dynamoUserStore } from './data/user-store';
import { jsonLogger } from './events/deps';
import { onSignUp } from './sign-up';

const table = process.env.TABLE_NAME;
if (!table) throw new Error('TABLE_NAME must be set');
const deps = {
  users: dynamoUserStore(createDb(table).data),
  cognito: new CognitoIdentityProviderClient({}),
  clock: systemClock,
  log: jsonLogger,
  tenantId: 'default',
};

/** Cognito post-confirmation trigger: it must return the event it was given. */
export async function handler(event: PostConfirmationTriggerEvent) {
  await onSignUp(event, deps);
  return event;
}
