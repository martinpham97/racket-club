import { defineConfig } from 'vitest/config';

// Two projects:
// - unit: fast, no Docker, required on every PR (coverage thresholds enforced)
// - integration: needs DynamoDB Local (`pnpm db:up`), files named *.int.test.ts
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{apps,packages,plugins,infra,tools}/**/*.test.{ts,tsx}'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/e2e/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['{apps,packages,plugins}/**/*.int.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/plugin-sdk/src/**', 'plugins/*/src/**'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: {
        // Design plan: 80% lines for core and plugin-sdk, 70% for plugins.
        'packages/core/src/**': { lines: 80 },
        'packages/plugin-sdk/src/**': { lines: 80 },
        'plugins/*/src/**': { lines: 70 },
      },
    },
  },
});
