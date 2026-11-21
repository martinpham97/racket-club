/**
 * Local AWS for `pnpm dev` and integration tests (docs/testing.md).
 *
 *   pnpm aws:up                 build the pinned image if needed, start it, wait until healthy
 *   pnpm aws:down               stop it (the emulator then deletes its per-run keys)
 *   pnpm aws:env -- <command>   run a command against the emulator
 *
 * CI runs the emulator natively from the .deb instead of Docker; `aws:env` works the same for both
 * because the emulator always writes its per-run files to ~/.aws/emulator/<port>/.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { request } from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 9297;
const REGION = 'us-east-1'; // the emulator serves one region
const here = dirname(fileURLToPath(import.meta.url));
const VERSION = readFileSync(join(here, 'VERSION'), 'utf8').trim();
const IMAGE = `racket-club-aws-emulator:${VERSION}`;
const CONTAINER = 'racket-club-aws-emulator';
const emulatorHome = join(homedir(), '.aws', 'emulator');
const runDir = join(emulatorHome, String(PORT));
const caFile = join(runDir, 'ca.pem');
const credentialsFile = join(runDir, 'emulator_credentials');
const endpoint = `https://127.0.0.1:${PORT}`;

function healthy(): Promise<boolean> {
  if (!existsSync(caFile)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const req = request(
      `${endpoint}/__admin/health`,
      { ca: readFileSync(caFile), timeout: 2000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    // A certificate left behind by a crashed run fails TLS until the new run replaces it.
    req.on('error', () => resolve(false));
    req.on('timeout', () => req.destroy());
    req.end();
  });
}

function docker(args: string[], opts: { quiet?: boolean } = {}) {
  return spawnSync('docker', args, { stdio: opts.quiet ? 'ignore' : 'inherit' }).status === 0;
}

async function up() {
  if (await healthy()) {
    console.log(`AWS Emulator already running on ${endpoint}`);
    return;
  }
  if (!docker(['image', 'inspect', IMAGE], { quiet: true })) {
    console.log(`Building ${IMAGE} (first run only)...`);
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const built = docker([
      'build',
      '-t',
      IMAGE,
      '--build-arg',
      `EMULATOR_VERSION=${VERSION}`,
      '--build-arg',
      `EMULATOR_ARCH=${arch}`,
      here,
    ]);
    if (!built) throw new Error('docker build failed; is Docker running?');
  }
  docker(['rm', '-f', CONTAINER], { quiet: true }); // a stopped leftover of ours
  mkdirSync(emulatorHome, { recursive: true });
  const user = process.getuid ? ['--user', `${process.getuid()}:${process.getgid?.()}`] : [];
  const started = docker([
    'run',
    '-d',
    '--rm',
    '--name',
    CONTAINER,
    // Limits and loopback-only publishing as the AWS Emulator user guide recommends.
    '--memory=2g',
    '--memory-swap=2g',
    '-p',
    `127.0.0.1:${PORT}:${PORT}`,
    '-v',
    `${emulatorHome}:/home/emulator/.aws/emulator`,
    ...user,
    IMAGE,
    '-p',
    String(PORT),
    '--telemetry',
    'off',
  ]);
  if (!started) throw new Error('docker run failed');
  for (let i = 0; i < 60; i++) {
    if (await healthy()) {
      console.log(`AWS Emulator ${VERSION} ready on ${endpoint}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`AWS Emulator did not become healthy; see: docker logs ${CONTAINER}`);
}

function down() {
  if (docker(['stop', CONTAINER], { quiet: true })) console.log('AWS Emulator stopped');
  else console.log('AWS Emulator was not running');
}

function readCredentials() {
  const text = readFileSync(credentialsFile, 'utf8');
  const get = (key: string) => text.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, 'm'))?.[1];
  const id = get('aws_access_key_id');
  const secret = get('aws_secret_access_key');
  if (!id || !secret) throw new Error(`No keys in ${credentialsFile}`);
  return { id, secret };
}

async function withEmulatorEnv(command: string[]) {
  if (command.length === 0) throw new Error('usage: pnpm aws:env -- <command...>');
  if (!(await healthy())) {
    throw new Error(`AWS Emulator is not running on ${endpoint}. Start it with: pnpm aws:up`);
  }
  const { id, secret } = readCredentials();
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Real AWS credentials must never reach a local run, whatever the developer's shell has set.
  for (const k of ['AWS_PROFILE', 'AWS_SESSION_TOKEN', 'AWS_SECURITY_TOKEN', 'AWS_ROLE_ARN']) {
    delete env[k];
  }
  Object.assign(env, {
    AWS_ENDPOINT_URL: endpoint,
    AWS_ACCESS_KEY_ID: id,
    AWS_SECRET_ACCESS_KEY: secret,
    AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
    // Not ~/.aws/config (real profiles), and not the emulator's own `config`: under Docker on
    // Windows its paths point inside the container.
    AWS_CONFIG_FILE: join(runDir, 'unused-config'),
    AWS_REGION: REGION,
    AWS_DEFAULT_REGION: REGION,
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_DISABLE_HOST_PREFIX_INJECTION: 'true',
    // The certificate is new on every emulator start. Node reads this only at startup, which
    // is why this is a wrapper and not code inside the app or tests.
    NODE_EXTRA_CA_CERTS: caFile,
    AWS_CA_BUNDLE: caFile,
  });
  const [cmd, ...args] = command as [string, ...string[]];
  // Windows needs a shell to run .cmd shims (pnpm, vitest), and Node joins shell arguments
  // without quoting them, so quote anything the shell would split or interpret.
  const win = process.platform === 'win32';
  const quote = (a: string) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
  const child = win
    ? spawn([cmd, ...args].map(quote).join(' '), { stdio: 'inherit', env, shell: true })
    : spawn(cmd, args, { stdio: 'inherit', env });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

const [action, ...rest] = process.argv.slice(2);
const command = rest[0] === '--' ? rest.slice(1) : rest;
const run = { up, down: async () => down(), env: () => withEmulatorEnv(command) }[action ?? ''];
if (!run) {
  console.error('usage: tsx tools/aws-emulator/index.ts up | down | env -- <command...>');
  process.exit(2);
}
run().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
