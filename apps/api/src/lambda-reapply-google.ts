import type { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { jsonLogger } from './events/deps';
import { googleSetupFromEnv } from './server';

/**
 * Runs on every stack deploy, after the Cognito app client. A stack update resets the client's
 * identity providers to the template's (email only), so put Google back if the coach set it up.
 * Used through the CDK custom resource Provider, which reports the result to CloudFormation.
 */
export async function handler(event: CloudFormationCustomResourceEvent) {
  if (event.RequestType === 'Delete') return { PhysicalResourceId: event.PhysicalResourceId };
  const setup = googleSetupFromEnv(process.env);
  if (!setup) throw new Error('USER_POOL_ID, USER_POOL_CLIENT_ID and SSM_PREFIX must be set');
  const reapplied = await setup.reapply();
  jsonLogger.info('google sign-in after deploy', { reapplied });
  return { PhysicalResourceId: 'reapply-google-sign-in', Data: { Reapplied: String(reapplied) } };
}
