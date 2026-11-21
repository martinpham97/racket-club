import {
  AdminAddUserToGroupCommand,
  type CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { Clock } from '@racket-club/core';
import { pickLocale } from '@racket-club/i18n';
import type { Logger } from '@racket-club/plugin-sdk';
import type { UserStore } from './users';

/** The fields of Cognito's post-confirmation event this uses. */
export interface PostConfirmationEvent {
  triggerSource: string;
  userPoolId: string;
  userName: string;
  request: { userAttributes: Record<string, string | undefined> };
}

export interface SignUpDeps {
  users: UserStore;
  cognito: CognitoIdentityProviderClient;
  clock: Clock;
  log: Logger;
  tenantId: string;
}

/**
 * A new account (Google or email) was confirmed: create the student's record and put them in
 * the `student` group. A failure here must not stop someone signing up, so it is logged, not
 * thrown: `/api/me` creates a missing record, and a user with no group is treated as a student.
 * Cognito can invoke a trigger more than once; both steps are idempotent.
 */
export async function onSignUp(event: PostConfirmationEvent, deps: SignUpDeps): Promise<void> {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return;
  const a = event.request.userAttributes;
  const userId = a.sub ?? event.userName;
  const email = a.email ?? '';
  try {
    await deps.users.ensure(
      deps.tenantId,
      {
        userId,
        email,
        name: a.name ?? a.given_name ?? (email.split('@')[0] || email),
        roles: ['student'],
        // Google's profile language, mapped to Cognito's `locale` attribute, e.g. "vi" or "en-AU".
        locale: pickLocale(a.locale, 'en'),
      },
      deps.clock.now().toISOString(),
    );
    await deps.cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        GroupName: 'student',
      }),
    );
  } catch (err) {
    deps.log.error('sign-up setup failed', { userId, error: (err as Error).message });
  }
}
