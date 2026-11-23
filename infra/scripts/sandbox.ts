/**
 * pnpm sandbox [diff|deploy|destroy] [-- extra cdk args]
 *
 * Builds the web app (the stack only uploads apps/web/dist if it exists), then runs cdk for your
 * own RacketClub-<name> stack. Uses your normal AWS credentials, e.g. AWS_PROFILE=racket-sandbox.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sandboxName, sandboxStackName } from '../bin/sandbox';

const infra = join(dirname(fileURLToPath(import.meta.url)), '..');
const [action = 'deploy', ...rest] = process.argv.slice(2);
const extra = rest[0] === '--' ? rest.slice(1) : rest;

const name = sandboxName(process.env);
if (!name) {
  console.error('Set SANDBOX_NAME (or USER/USERNAME) to name your sandbox stack.');
  process.exit(2);
}
if (!['diff', 'deploy', 'destroy'].includes(action)) {
  console.error('usage: pnpm sandbox [diff|deploy|destroy] [-- cdk args]');
  process.exit(2);
}

const run = (cmd: string, args: string[], cwd: string) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (action !== 'destroy') run('pnpm', ['--filter', '@racket-club/web', 'build'], infra);
const stack = sandboxStackName(name);
// Later deploys patch Lambda code directly (fine for a sandbox); the first one, and changes
// hotswap can't do, fall back to a normal CloudFormation deploy. Plain --hotswap fails outright
// on a stack that doesn't exist yet.
const args =
  action === 'deploy'
    ? ['deploy', stack, '--hotswap-fallback', ...extra]
    : [action, stack, ...extra];
run('pnpm', ['exec', 'cdk', ...args], infra);
