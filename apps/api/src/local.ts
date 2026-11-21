import { serve } from '@hono/node-server';
import { createEventDeps } from './events/deps';
import { startLocalEventLoop } from './events/local-loop';
import { assertLocalEndpoint, createLocalResources, localNames } from './local-aws';
import { buildApp } from './server';

// This entry point only runs on a developer machine (Lambda uses lambda.ts), so a fresh clone
// without .env should still get the mock sign-in rather than an unusable Cognito mode.
process.env.AUTH_MODE ??= 'mock';
if (process.env.AUTH_MODE !== 'mock') {
  console.warn(`AUTH_MODE is "${process.env.AUTH_MODE}"; local development expects "mock".`);
}

if (process.env.TABLE_NAME) {
  // With a table configured, data goes to AWS: make sure that is the local emulator (run
  // through `pnpm dev`), never a real account through credentials in ~/.aws.
  assertLocalEndpoint();
  await createLocalResources();
  // Table changes become domain events and run plugin hooks, as the Lambdas do in AWS.
  startLocalEventLoop(
    createEventDeps({ table: process.env.TABLE_NAME, bus: localNames.bus, env: process.env }),
    { table: process.env.TABLE_NAME, queue: localNames.queue },
  );
  console.log('Local events: table stream -> EventBridge -> SQS -> plugin hooks');
}

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: buildApp().fetch, port }, () => {
  console.log(`Racket Club API on http://localhost:${port}/api/health`);
});
