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
  // Starts the API (mock auth) and the web dev server.
  webServer: [
    {
      command: 'pnpm --filter @racket-club/api dev',
      url: `http://localhost:${apiPort}/api/health`,
      // No TABLE_NAME: e2e keeps settings in memory and needs no AWS Emulator.
      env: { AUTH_MODE: 'mock', API_PORT: apiPort, TABLE_NAME: '' },
      reuseExistingServer: !process.env.CI,
    },
    { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
  ],
});
