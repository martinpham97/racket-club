import { createLocalResources } from '../local-aws';

/** Vitest globalSetup for the integration project: runs once, before any *.int.test.ts. */
export default async function setup() {
  await createLocalResources();
}
