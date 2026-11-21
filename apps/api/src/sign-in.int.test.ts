import { randomUUID } from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeIdentityProviderCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { fixedClock } from '@racket-club/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './data/client';
import { dynamoUserStore } from './data/user-store';
import { googleSetup } from './google-sign-in';
import { assertLocalEndpoint, localNames } from './local-aws';
import { onSignUp } from './sign-up';

assertLocalEndpoint();
const cognito = new CognitoIdentityProviderClient({});
const ssm = new SSMClient({});
const users = dynamoUserStore(createDb(localNames.table).data);
const clock = fixedClock('2026-12-01T00:00:00.000Z');
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

let userPoolId = '';
let appClientId = '';
beforeAll(async () => {
  const pool = await cognito.send(new CreateUserPoolCommand({ PoolName: `test-${randomUUID()}` }));
  userPoolId = pool.UserPool?.Id as string;
  await cognito.send(new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: 'student' }));
  const client = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: 'WebClient',
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: ['openid', 'email', 'profile'],
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: ['https://app.example/auth/callback'],
      SupportedIdentityProviders: ['COGNITO'],
    }),
  );
  appClientId = client.UserPoolClient?.ClientId as string;
});

const newUser = {
  userId: 'u',
  email: 'linh@example.com',
  name: 'Linh',
  roles: ['student'] as const,
  locale: 'vi' as const,
};

describe('dynamoUserStore', () => {
  it('creates a record once, even when the trigger and /api/me race', async () => {
    const tenantId = `test-${randomUUID()}`;
    const u = { ...newUser, roles: [...newUser.roles] };
    const [a, b] = await Promise.all([
      users.ensure(tenantId, u, '2026-12-01T00:00:00.000Z'),
      users.ensure(tenantId, { ...u, name: 'Someone else' }, '2026-12-01T00:00:00.000Z'),
    ]);
    expect(a.name).toBe(b.name);
    expect(a.onboarding).toBeNull();
  });

  it('saves onboarding, and drops a guardian when the student is no longer a junior', async () => {
    const tenantId = `test-${randomUUID()}`;
    await users.ensure(tenantId, { ...newUser, roles: ['student'] }, 'now');
    const base = {
      name: 'Linh Nguyen',
      phone: '0412 345 678',
      skillLevel: 'improver' as const,
      locale: 'vi' as const,
      emergencyContact: { name: 'Minh', phone: '0412 000 111' },
    };
    const junior = await users.completeOnboarding(
      tenantId,
      'u',
      {
        ...base,
        junior: true,
        guardian: { name: 'Hoa', phone: '0299 999 999', email: 'hoa@example.com' },
      },
      '2026-12-02T00:00:00.000Z',
    );
    expect(junior.onboarding).toMatchObject({ junior: true, guardian: { name: 'Hoa' } });
    const adult = await users.completeOnboarding(
      tenantId,
      'u',
      { ...base, junior: false, guardian: null },
      '2026-12-03T00:00:00.000Z',
    );
    expect(adult).toMatchObject({
      name: 'Linh Nguyen',
      onboarding: { junior: false, guardian: null, completedAt: '2026-12-03T00:00:00.000Z' },
    });
  });
});

describe('post-confirmation trigger', () => {
  it('creates the student record and adds them to the student group, idempotently', async () => {
    const tenantId = `test-${randomUUID()}`;
    const username = `google_${randomUUID()}`;
    await cognito.send(new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: username }));
    const event = {
      triggerSource: 'PostConfirmation_ConfirmSignUp',
      userPoolId,
      userName: username,
      request: {
        userAttributes: { sub: 'sub-1', email: 'an@example.com', name: 'An Tran', locale: 'vi' },
      },
    };
    const deps = { users, cognito, clock, log: quiet, tenantId };
    await onSignUp(event, deps);
    await onSignUp(event, deps); // Cognito may invoke a trigger twice

    const record = await users.ensure(
      tenantId,
      { ...newUser, userId: 'sub-1', roles: ['student'] },
      'x',
    );
    expect(record).toMatchObject({
      userId: 'sub-1',
      name: 'An Tran',
      email: 'an@example.com',
      locale: 'vi',
    });
    const groups = await cognito.send(
      new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: username }),
    );
    expect(groups.Groups?.map((g) => g.GroupName)).toEqual(['student']);
  });

  it('ignores other trigger sources and never throws into sign-up', async () => {
    const errors: string[] = [];
    const deps = {
      users,
      cognito,
      clock,
      log: { ...quiet, error: (m: string) => void errors.push(m) },
      tenantId: `test-${randomUUID()}`,
    };
    const forgot = {
      triggerSource: 'PostConfirmation_ConfirmForgotPassword',
      userPoolId,
      userName: 'x',
      request: { userAttributes: {} },
    };
    await onSignUp(forgot, deps);
    // A user Cognito doesn't know: the group step fails, sign-up must still go ahead.
    const unknown = {
      ...forgot,
      triggerSource: 'PostConfirmation_ConfirmSignUp',
      userName: 'nobody',
      request: { userAttributes: { sub: 's2', email: 'z@example.com' } },
    };
    await expect(onSignUp(unknown, deps)).resolves.toBeUndefined();
    expect(errors).toEqual(['sign-up setup failed']);
  });
});

describe('Google sign-in setup', () => {
  const google = {
    clientId: '1234-abc.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-abcdefghijkl',
  };
  const setupFor = (prefix: string) =>
    googleSetup({ cognito, ssm, parameterPrefix: prefix, userPoolId, appClientId });

  it('turns Google on for the app client and keeps its other settings', async () => {
    const setup = setupFor(`/racket-club/test-${randomUUID()}`);
    expect(await setup.status()).toEqual({ configured: false, clientId: null });
    await setup.configure(google);

    const provider = await cognito.send(
      new DescribeIdentityProviderCommand({ UserPoolId: userPoolId, ProviderName: 'Google' }),
    );
    expect(provider.IdentityProvider?.ProviderDetails?.client_id).toBe(google.clientId);
    expect(provider.IdentityProvider?.AttributeMapping?.locale).toBe('locale');
    const { UserPoolClient } = await cognito.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: appClientId }),
    );
    expect(UserPoolClient?.SupportedIdentityProviders?.sort()).toEqual(['COGNITO', 'Google']);
    expect(UserPoolClient?.CallbackURLs).toEqual(['https://app.example/auth/callback']);
    expect(UserPoolClient?.AllowedOAuthFlows).toEqual(['code']);
    expect(await setup.status()).toEqual({ configured: true, clientId: google.clientId });
  });

  it('keeps the secret as a SecureString, and puts Google back after a stack update', async () => {
    const prefix = `/racket-club/test-${randomUUID()}`;
    const setup = setupFor(prefix);
    await setup.configure(google);
    const secret = await ssm.send(
      new GetParameterCommand({ Name: `${prefix}/google/client-secret` }),
    );
    expect(secret.Parameter?.Type).toBe('SecureString');

    // What a CloudFormation update does to the client: back to the template's providers.
    const { UserPoolClient } = await cognito.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: appClientId }),
    );
    await cognito.send(
      new UpdateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: appClientId,
        ClientName: UserPoolClient?.ClientName,
        AllowedOAuthFlows: ['code'],
        AllowedOAuthScopes: ['openid', 'email', 'profile'],
        AllowedOAuthFlowsUserPoolClient: true,
        CallbackURLs: UserPoolClient?.CallbackURLs,
        SupportedIdentityProviders: ['COGNITO'],
      }),
    );
    expect(await setup.reapply()).toBe(true);
    const after = await cognito.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: appClientId }),
    );
    expect(after.UserPoolClient?.SupportedIdentityProviders?.sort()).toEqual(['COGNITO', 'Google']);

    expect(await setupFor(`/racket-club/test-${randomUUID()}`).reapply()).toBe(false);
  });
});
