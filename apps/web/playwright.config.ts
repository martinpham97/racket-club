import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.API_PORT ?? '8787';

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Starts the API (mock auth) and the web dev server; DynamoDB Local is not needed yet.
  webServer: [
    {
      command: 'pnpm --filter @racket-club/api dev',
      url: `http://localhost:${apiPort}/api/health`,
      env: { AUTH_MODE: 'mock', API_PORT: apiPort },
      reuseExistingServer: !process.env.CI,
    },
    { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
  ],
});
