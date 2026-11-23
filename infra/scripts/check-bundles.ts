/**
 * tsx scripts/check-bundles.ts <stack>   (after `cdk synth <stack>`)
 *
 * Loads every Lambda bundle of the stack in Node and checks it exports `handler`. Bundles can
 * build fine and still crash on load: an ES module bundle of CommonJS dependencies once failed
 * with `Dynamic require of "node:https" is not supported`, which only shows in AWS otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stack = process.argv[2] ?? 'RacketClub';
const out = resolve('cdk.out');
const manifest = JSON.parse(readFileSync(join(out, `${stack}.assets.json`), 'utf8')) as {
  files: Record<string, { source: { path?: string } }>;
};

// Module-level code reads these; the values are placeholders, nothing is called on load.
Object.assign(process.env, {
  AWS_REGION: 'us-east-1',
  TABLE_NAME: 'table',
  EVENT_BUS_NAME: 'bus',
  USER_POOL_ID: 'pool',
  USER_POOL_CLIENT_ID: 'client',
  SSM_PREFIX: '/racket-club/check',
  AUTH_MODE: 'cognito',
});

const bundles = Object.values(manifest.files)
  .map((f) => f.source.path)
  .filter((p): p is string => Boolean(p))
  .map((p) => join(out, p, 'index.mjs'))
  .filter(existsSync);

let failed = 0;
for (const file of bundles) {
  const name = file.split(/[\\/]/).at(-2)?.slice(0, 18);
  try {
    const mod = (await import(pathToFileURL(file).href)) as { handler?: unknown };
    if (typeof mod.handler !== 'function') throw new Error('no exported handler');
    console.log(`ok    ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}: ${(err as Error).message}`);
  }
}
if (bundles.length === 0) {
  console.error(`No Lambda bundles found for ${stack}; run cdk synth first.`);
  process.exit(1);
}
console.log(`${bundles.length - failed}/${bundles.length} Lambda bundles load`);
process.exit(failed ? 1 : 0);
