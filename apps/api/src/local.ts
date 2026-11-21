import { serve } from '@hono/node-server';
import { buildApp } from './server';

// This entry point only runs on a developer machine (Lambda uses lambda.ts), so a fresh clone
// without .env should still get the mock sign-in rather than an unusable Cognito mode.
process.env.AUTH_MODE ??= 'mock';
if (process.env.AUTH_MODE !== 'mock') {
  console.warn(`AUTH_MODE is "${process.env.AUTH_MODE}"; local development expects "mock".`);
}

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: buildApp().fetch, port }, () => {
  console.log(`Racket Club API on http://localhost:${port}/api/health`);
});
