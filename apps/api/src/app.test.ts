import { definePlugin } from '@racket-club/plugin-sdk';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import themeCourt from '../../../plugins/theme-court/src/index';
import { createApp } from './app';
import { mockAuth } from './auth';
import { memorySettingsStore } from './settings-store';

const owner = JSON.stringify({ id: 'coach', email: 'coach@example.com', roles: ['owner'] });
const student = JSON.stringify({ id: 'stu', email: 'stu@example.com', roles: ['student'] });

const hello = definePlugin({
  id: 'hello',
  name: { en: 'Hello', vi: 'Xin chào' },
  version: '0.1.0',
  requiresCore: '^0.1.0',
  routes: (router) => {
    (router as Hono).get('/ping', (c) => c.json({ pong: true }));
  },
});

const make = (env: Record<string, string> = {}) =>
  createApp({
    plugins: [hello, themeCourt],
    settings: memorySettingsStore(),
    auth: mockAuth,
    env,
  });

type PublicConfig = { branding: { appName: string } };

const as = (user: string, init: RequestInit = {}) => ({
  ...init,
  headers: { 'x-mock-user': user, 'content-type': 'application/json', ...(init.headers ?? {}) },
});

describe('public config', () => {
  it('reports the default name, or the deploy-time APP_NAME', async () => {
    const def = (await (await make().request('/api/config')).json()) as PublicConfig;
    expect(def.branding.appName).toBe('Racket Club');
    const custom = (await (
      await make({ APP_NAME: 'Smash Academy' }).request('/api/config')
    ).json()) as PublicConfig;
    expect(custom.branding.appName).toBe('Smash Academy');
  });

  it('serves the theme as CSS variables', async () => {
    const res = await make().request('/api/theme.css');
    expect(res.headers.get('content-type')).toContain('text/css');
    expect(await res.text()).toContain('--rc-color-primary');
  });
});

describe('roles', () => {
  it('blocks signed-out users and students from admin routes', async () => {
    const app = make();
    expect((await app.request('/api/admin/plugins')).status).toBe(401);
    expect((await app.request('/api/admin/plugins', as(student))).status).toBe(403);
    expect((await app.request('/api/admin/plugins', as(owner))).status).toBe(200);
  });
});

describe('plugins and themes', () => {
  it('only serves plugin routes once the coach activates the plugin', async () => {
    const app = make();
    expect((await app.request('/api/p/hello/ping', as(student))).status).toBe(404);
    await app.request('/api/admin/plugins/hello/activate', as(owner, { method: 'POST' }));
    expect(await (await app.request('/api/p/hello/ping', as(student))).json()).toEqual({
      pong: true,
    });
  });

  it('switches theme and rejects unreadable colours', async () => {
    const app = make();
    await app.request('/api/admin/plugins/theme-court/activate', as(owner, { method: 'POST' }));
    const ok = await app.request(
      '/api/admin/branding',
      as(owner, {
        method: 'PUT',
        body: JSON.stringify({ activeThemeId: 'theme-court', appName: 'Coach Linh' }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await (await app.request('/api/theme.css')).text()).toContain('#0b6b3a');

    const bad = await app.request(
      '/api/admin/branding',
      as(owner, {
        method: 'PUT',
        body: JSON.stringify({ tokenOverrides: { 'color.primary': '#fafafa' } }),
      }),
    );
    expect(bad.status).toBe(400);
  });
});
