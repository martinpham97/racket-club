/**
 * `pnpm seed`: demo data in the local AWS Emulator (see seed-data.ts). The emulator keeps data in
 * memory, so restart it (`pnpm aws:down && pnpm aws:up`) to start again.
 */
import { systemClock } from '@racket-club/core';
import { createDb } from './data/client';
import { assertLocalEndpoint, createLocalResources, localNames } from './local-aws';
import { seedDemoData } from './seed-data';

assertLocalEndpoint();
await createLocalResources();
const result = await seedDemoData(createDb(localNames.table).data, systemClock);
console.log(
  result.seeded
    ? `Seeded: ${JSON.stringify(result)}`
    : 'Already seeded. Restart the emulator to start again: pnpm aws:down && pnpm aws:up',
);
