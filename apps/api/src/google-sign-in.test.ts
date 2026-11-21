import type { UserPoolClientType } from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it } from 'vitest';
import { parseGoogleClient, withGoogle } from './google-sign-in';

describe('parseGoogleClient', () => {
  it('accepts a client from Google Cloud Console, trimmed', () => {
    expect(
      parseGoogleClient({
        clientId: ' 1234-abc.apps.googleusercontent.com ',
        clientSecret: 'GOCSPX-abcdefghijkl ',
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        clientId: '1234-abc.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-abcdefghijkl',
      },
    });
  });

  it('names what looks wrong', () => {
    expect(parseGoogleClient({ clientId: 'my-app', clientSecret: 'short' })).toEqual({
      kind: 'invalid',
      fields: ['clientId', 'clientSecret'],
    });
    expect(parseGoogleClient(undefined)).toMatchObject({ kind: 'invalid' });
    expect(
      parseGoogleClient({
        clientId: 'x.apps.googleusercontent.com',
        clientSecret: 'has a space x',
      }),
    ).toEqual({ kind: 'invalid', fields: ['clientSecret'] });
  });
});

describe('withGoogle', () => {
  const client: UserPoolClientType = {
    UserPoolId: 'pool',
    ClientId: 'client',
    ClientName: 'WebClient',
    ClientSecret: 'never-sent-back',
    CreationDate: new Date(0),
    LastModifiedDate: new Date(0),
    CallbackURLs: ['https://app.example/auth/callback'],
    LogoutURLs: ['https://app.example'],
    AllowedOAuthFlows: ['code'],
    AllowedOAuthScopes: ['openid', 'email', 'profile'],
    AllowedOAuthFlowsUserPoolClient: true,
    SupportedIdentityProviders: ['COGNITO'],
    IdTokenValidity: 60,
    TokenValidityUnits: { IdToken: 'minutes' },
  };

  it('adds Google and keeps every other setting, which an update would otherwise reset', () => {
    const update = withGoogle(client);
    expect(update.SupportedIdentityProviders).toEqual(['COGNITO', 'Google']);
    expect(update).toMatchObject({
      UserPoolId: 'pool',
      ClientId: 'client',
      CallbackURLs: ['https://app.example/auth/callback'],
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      IdTokenValidity: 60,
      TokenValidityUnits: { IdToken: 'minutes' },
    });
    expect(update).not.toHaveProperty('ClientSecret');
    expect(update).not.toHaveProperty('CreationDate');
  });

  it('is idempotent and keeps email sign-in', () => {
    const once = withGoogle({ ...client, SupportedIdentityProviders: undefined });
    expect(once.SupportedIdentityProviders).toEqual(['COGNITO', 'Google']);
    const twice = withGoogle({ ...client, SupportedIdentityProviders: ['Google', 'COGNITO'] });
    expect(twice.SupportedIdentityProviders?.sort()).toEqual(['COGNITO', 'Google']);
  });
});
