import { fixedClock } from '@racket-club/core';
import { definePlugin } from '@racket-club/plugin-sdk';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import themeCourt from '../../../plugins/theme-court/src/index';
import { createApp } from './app';
import { mockAuth } from './auth';
import type { GoogleSetup } from './google-sign-in';
import { memorySettingsStore } from './settings-store';
import { memoryUserStore } from './users';

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

const make = (env: Record<string, string> = {}, extra: { googleSetup?: GoogleSetup } = {}) =>
  createApp({
    ...extra,
    plugins: [hello, themeCourt],
    settings: memorySettingsStore(),
    users: memoryUserStore(),
    clock: fixedClock('2026-12-01T00:00:00.000Z'),
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

describe('me and onboarding', () => {
  type Me = { needsOnboarding: boolean; roles: string[] };
  const answers = {
    name: 'Linh Nguyen',
    phone: '0412 345 678',
    skillLevel: 'improver',
    locale: 'vi',
    emergencyContact: { name: 'Minh Nguyen', phone: '0412 000 111' },
    junior: false,
  };
  const put = (body: unknown) => as(student, { method: 'PUT', body: JSON.stringify(body) });

  it('creates the record on first sight and asks students, not the coach, to onboard', async () => {
    const app = make();
    expect((await app.request('/api/me')).status).toBe(401);
    const me = (await (await app.request('/api/me', as(student))).json()) as Me;
    expect(me).toMatchObject({
      userId: 'stu',
      name: 'stu',
      roles: ['student'],
      needsOnboarding: true,
    });
    const coach = await (await app.request('/api/me', as(owner))).json();
    expect(coach).toMatchObject({ userId: 'coach', needsOnboarding: false });
  });

  it('saves valid answers and stops asking', async () => {
    const app = make();
    const res = await app.request('/api/me/onboarding', put(answers));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: 'Linh Nguyen',
      locale: 'vi',
      needsOnboarding: false,
      onboarding: {
        skillLevel: 'improver',
        junior: false,
        completedAt: '2026-12-01T00:00:00.000Z',
      },
    });
    const me = (await (await app.request('/api/me', as(student))).json()) as Me;
    expect(me.needsOnboarding).toBe(false);
  });

  it('names the fields to fix, including a junior without a guardian', async () => {
    const app = make();
    const res = await app.request('/api/me/onboarding', put({ ...answers, junior: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid',
      fields: ['guardian.name', 'guardian.phone', 'guardian.email'],
    });
    expect(
      (await app.request('/api/me/onboarding', as(student, { method: 'PUT', body: '{' }))).status,
    ).toBe(400);
  });

  it('takes roles from the token, not from what was stored', async () => {
    const app = make();
    await app.request('/api/me', as(student));
    const promoted = JSON.stringify({ id: 'stu', email: 'stu@example.com', roles: ['staff'] });
    const me = (await (await app.request('/api/me', as(promoted))).json()) as Me;
    expect(me.roles).toEqual(['staff']);
  });
});

describe('setup wizard: Google sign-in', () => {
  const valid = {
    clientId: '1234-abc.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-abcdefghijkl',
  };
  function fakeSetup(fail = false) {
    const saved: unknown[] = [];
    let clientId: string | null = null;
    const setup: GoogleSetup = {
      status: async () => ({ configured: clientId !== null, clientId }),
      configure: async (g) => {
        if (fail) throw new Error('InvalidParameterException: bad client');
        saved.push(g);
        clientId = g.clientId;
      },
      reapply: async () => clientId !== null,
    };
    return { setup, saved };
  }
  const env = { COGNITO_DOMAIN: 'https://rc-1.auth.ap-southeast-2.amazoncognito.com' };
  const put = (who: string, body: unknown) =>
    as(who, { method: 'PUT', body: JSON.stringify(body) });

  it('shows the coach the redirect URL, and only the coach', async () => {
    const app = make(env, { googleSetup: fakeSetup().setup });
    expect((await app.request('/api/admin/setup/google', as(student))).status).toBe(403);
    expect(await (await app.request('/api/admin/setup/google', as(owner))).json()).toEqual({
      configured: false,
      clientId: null,
      redirectUrl: 'https://rc-1.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse',
    });
  });

  it('turns Google on, and the sign-in screen offers it from then on', async () => {
    const { setup, saved } = fakeSetup();
    const app = make(env, { googleSetup: setup });
    type Config = { auth: { google: boolean } };
    expect(((await (await app.request('/api/config')).json()) as Config).auth.google).toBe(false);
    const res = await app.request('/api/admin/setup/google', put(owner, valid));
    expect(res.status).toBe(200);
    expect(saved).toEqual([valid]);
    expect(((await (await app.request('/api/config')).json()) as Config).auth.google).toBe(true);
    expect((await app.request('/api/admin/setup/google', put(student, valid))).status).toBe(403);
  });

  it('says what is wrong, or that Cognito refused, and saves nothing', async () => {
    const { setup, saved } = fakeSetup(true);
    const app = make(env, { googleSetup: setup });
    const bad = await app.request('/api/admin/setup/google', put(owner, { clientId: 'x' }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid', fields: ['clientId', 'clientSecret'] });
    const refused = await app.request('/api/admin/setup/google', put(owner, valid));
    expect(refused.status).toBe(502);
    expect(saved).toEqual([]);
  });

  it('is unavailable without Cognito (local development)', async () => {
    const res = await make().request('/api/admin/setup/google', as(owner));
    expect(res.status).toBe(503);
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
