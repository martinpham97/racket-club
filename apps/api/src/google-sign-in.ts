/**
 * Setup wizard, step "Google sign-in": the coach pastes the OAuth client from Google Cloud
 * Console and we turn on Google as a Cognito identity provider.
 *
 * The client ID and secret are kept in SSM (the secret as a SecureString), because CloudFormation
 * manages the Cognito app client: a stack update resets its identity providers to email only,
 * so a deploy-time step re-applies Google from SSM afterwards (`lambda-reapply-google.ts`).
 */
import {
  type CognitoIdentityProviderClient,
  CreateIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  DescribeUserPoolClientCommand,
  ResourceNotFoundException,
  UpdateIdentityProviderCommand,
  UpdateUserPoolClientCommand,
  type UpdateUserPoolClientCommandInput,
  type UserPoolClientType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  GetParametersCommand,
  ParameterType,
  PutParameterCommand,
  type SSMClient,
} from '@aws-sdk/client-ssm';

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export type GoogleClientResult =
  | { kind: 'valid'; value: GoogleClient }
  | { kind: 'invalid'; fields: Array<'clientId' | 'clientSecret'> };

/** Catches the usual copy-paste mistakes before Cognito does. */
export function parseGoogleClient(input: unknown): GoogleClientResult {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const id = typeof i.clientId === 'string' ? i.clientId.trim() : '';
  const secret = typeof i.clientSecret === 'string' ? i.clientSecret.trim() : '';
  const fields: Array<'clientId' | 'clientSecret'> = [];
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) fields.push('clientId');
  if (secret.length < 10 || /\s/.test(secret)) fields.push('clientSecret');
  return fields.length
    ? { kind: 'invalid', fields }
    : { kind: 'valid', value: { clientId: id, clientSecret: secret } };
}

const PROVIDER = 'Google';

/**
 * The update that adds Google to an app client. UpdateUserPoolClient resets every setting it
 * isn't given, so start from the full current description and change only the providers.
 */
export function withGoogle(client: UserPoolClientType): UpdateUserPoolClientCommandInput {
  const { ClientSecret: _secret, CreationDate: _c, LastModifiedDate: _m, ...settings } = client;
  const providers = new Set(client.SupportedIdentityProviders ?? ['COGNITO']);
  providers.add('COGNITO'); // email sign-in stays as the fallback
  providers.add(PROVIDER);
  return {
    ...settings,
    UserPoolId: client.UserPoolId,
    ClientId: client.ClientId,
    SupportedIdentityProviders: [...providers],
  };
}

export async function applyGoogleSignIn(
  cognito: CognitoIdentityProviderClient,
  pool: { userPoolId: string; appClientId: string },
  google: GoogleClient,
): Promise<void> {
  const ProviderDetails = {
    client_id: google.clientId,
    client_secret: google.clientSecret,
    authorize_scopes: 'openid email profile',
  };
  const AttributeMapping = {
    email: 'email',
    email_verified: 'email_verified',
    name: 'name',
    given_name: 'given_name',
    family_name: 'family_name',
    picture: 'picture',
    locale: 'locale',
    username: 'sub',
  };
  const exists = await cognito
    .send(
      new DescribeIdentityProviderCommand({
        UserPoolId: pool.userPoolId,
        ProviderName: PROVIDER,
      }),
    )
    .then(
      () => true,
      (err) => {
        if (err instanceof ResourceNotFoundException) return false;
        throw err;
      },
    );
  const provider = {
    UserPoolId: pool.userPoolId,
    ProviderName: PROVIDER,
    ProviderDetails,
    AttributeMapping,
  };
  if (exists) await cognito.send(new UpdateIdentityProviderCommand(provider));
  else
    await cognito.send(new CreateIdentityProviderCommand({ ...provider, ProviderType: 'Google' }));
  const { UserPoolClient } = await cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: pool.userPoolId, ClientId: pool.appClientId }),
  );
  if (!UserPoolClient) throw new Error(`App client ${pool.appClientId} not found`);
  await cognito.send(new UpdateUserPoolClientCommand(withGoogle(UserPoolClient)));
}

export interface GoogleSetup {
  /** Whether students can choose Google; cached briefly because /api/config asks on every load. */
  status(): Promise<{ configured: boolean; clientId: string | null }>;
  configure(google: GoogleClient): Promise<void>;
  /** Re-apply what the coach configured (after a stack update). No-op if nothing is saved. */
  reapply(): Promise<boolean>;
}

export function googleSetup(deps: {
  cognito: CognitoIdentityProviderClient;
  ssm: SSMClient;
  /** e.g. `/racket-club/<stack>`; set by the stack. */
  parameterPrefix: string;
  userPoolId: string;
  appClientId: string;
  now?: () => number;
}): GoogleSetup {
  const names = {
    clientId: `${deps.parameterPrefix}/google/client-id`,
    clientSecret: `${deps.parameterPrefix}/google/client-secret`,
  };
  const now = deps.now ?? Date.now;
  let cached: { at: number; clientId: string | null } | null = null;

  const read = async (): Promise<GoogleClient | null> => {
    const res = await deps.ssm.send(
      new GetParametersCommand({
        Names: [names.clientId, names.clientSecret],
        WithDecryption: true,
      }),
    );
    const value = (name: string) => res.Parameters?.find((p) => p.Name === name)?.Value;
    const clientId = value(names.clientId);
    const clientSecret = value(names.clientSecret);
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };
  const pool = { userPoolId: deps.userPoolId, appClientId: deps.appClientId };

  return {
    async status() {
      if (!cached || now() - cached.at > 60_000) {
        cached = { at: now(), clientId: (await read())?.clientId ?? null };
      }
      return { configured: cached.clientId !== null, clientId: cached.clientId };
    },
    async configure(google) {
      // Cognito first: if Google rejects the client, nothing is saved.
      await applyGoogleSignIn(deps.cognito, pool, google);
      await deps.ssm.send(
        new PutParameterCommand({
          Name: names.clientSecret,
          Value: google.clientSecret,
          Type: ParameterType.SECURE_STRING,
          Overwrite: true,
        }),
      );
      await deps.ssm.send(
        new PutParameterCommand({
          Name: names.clientId,
          Value: google.clientId,
          Type: ParameterType.STRING,
          Overwrite: true,
        }),
      );
      cached = { at: now(), clientId: google.clientId };
    },
    async reapply() {
      const google = await read();
      if (!google) return false;
      await applyGoogleSignIn(deps.cognito, pool, google);
      return true;
    },
  };
}
