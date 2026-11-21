import { type Clock, parseOnboarding, resolveBranding, systemClock } from '@racket-club/core';
import {
  resolveTheme,
  type ThemeDefinition,
  ThemeValidationError,
  themeStylesheet,
} from '@racket-club/plugin-sdk';
import { Hono, type MiddlewareHandler } from 'hono';
import { type AuthUser, type AuthVariables, requireRole } from './auth';
import { type GoogleSetup, parseGoogleClient } from './google-sign-in';
import { type AnyPlugin, CORE_VERSION, registryFor as registryForTenant } from './plugins';
import type { SettingsStore } from './settings-store';
import type { UserStore } from './users';

export { CORE_VERSION };

export interface AppDeps {
  plugins: AnyPlugin[];
  settings: SettingsStore;
  users: UserStore;
  clock?: Clock;
  /** Only in AWS: there is no Cognito locally. */
  googleSetup?: GoogleSetup;
  auth: MiddlewareHandler<{ Variables: AuthVariables }>;
  env: Record<string, string | undefined>;
  /** Resolved from the host name later (multi-tenant ready); always 'default' for now. */
  tenantOf?: (host: string | undefined) => string;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AuthVariables & { tenantId: string } }>().basePath('/api');
  const tenantOf = deps.tenantOf ?? (() => 'default');

  app.use('*', async (c, next) => {
    c.set('tenantId', tenantOf(c.req.header('host')));
    await next();
  });
  app.use('*', deps.auth);

  const registryFor = (tenantId: string) =>
    registryForTenant(deps.plugins, deps.settings, tenantId);

  const themeFor = async (tenantId: string) => {
    const reg = await registryFor(tenantId);
    const branding = resolveBranding(await deps.settings.getBranding(tenantId), deps.env);
    const themes = reg.themes().map((p) => p.theme as ThemeDefinition);
    return {
      branding,
      theme: resolveTheme(themes, branding.activeThemeId, branding.tokenOverrides),
      reg,
    };
  };

  app.get('/health', (c) => c.json({ ok: true, version: CORE_VERSION }));

  // Public: what the web app needs before sign-in (name, theme, languages, active plugins).
  app.get('/config', async (c) => {
    const { branding, theme, reg } = await themeFor(c.get('tenantId'));
    return c.json({
      branding,
      theme: { id: theme.id, layout: theme.layout },
      locales: ['en', 'vi'],
      plugins: reg.activePlugins().map((p) => ({ id: p.id, name: p.name })),
      auth: {
        mode: deps.env.AUTH_MODE ?? 'cognito',
        userPoolClientId: deps.env.USER_POOL_CLIENT_ID ?? null,
        domain: deps.env.COGNITO_DOMAIN ?? null,
        // Until the coach finishes this setup step, students sign up with email.
        google: deps.googleSetup ? (await deps.googleSetup.status()).configured : false,
      },
    });
  });

  app.get('/theme.css', async (c) => {
    const { theme } = await themeFor(c.get('tenantId'));
    c.header('content-type', 'text/css; charset=utf-8');
    c.header('cache-control', 'public, max-age=60');
    return c.body(themeStylesheet(theme));
  });

  const clock = deps.clock ?? systemClock;
  const signedIn = requireRole('owner', 'staff', 'student');
  // Signed in means a token (or mock user); the record is created on first sight, which covers
  // the coach, whose account is made at deploy time without the sign-up trigger.
  const profileOf = async (c: { get(k: 'user'): AuthUser | null; get(k: 'tenantId'): string }) => {
    const u = c.get('user') as AuthUser;
    const profile = await deps.users.ensure(
      c.get('tenantId'),
      { userId: u.id, email: u.email, name: u.name, roles: u.roles, locale: u.locale },
      clock.now().toISOString(),
    );
    return { u, profile };
  };
  const meView = (u: AuthUser, profile: Awaited<ReturnType<UserStore['ensure']>>) => ({
    ...profile,
    // Roles come from the token (Cognito groups), never from what is stored.
    roles: u.roles,
    // The first-sign-in form is for students; the coach and staff skip it.
    needsOnboarding: u.roles.includes('student') && profile.onboarding === null,
  });

  app.get('/me', signedIn, async (c) => {
    const { u, profile } = await profileOf(c);
    return c.json(meView(u, profile));
  });

  app.put('/me/onboarding', signedIn, async (c) => {
    const parsed = parseOnboarding(await c.req.json().catch(() => null));
    if (parsed.kind === 'invalid') return c.json({ error: 'invalid', fields: parsed.fields }, 400);
    const { u } = await profileOf(c);
    const saved = await deps.users.completeOnboarding(
      c.get('tenantId'),
      u.id,
      parsed.value,
      clock.now().toISOString(),
    );
    return c.json(meView(u, saved));
  });

  // ---- Admin: plugins -------------------------------------------------------------
  app.get('/admin/plugins', requireRole('owner'), async (c) => {
    const reg = await registryFor(c.get('tenantId'));
    return c.json(
      reg.installed().map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        active: reg.isActive(p.id),
        isTheme: p.theme !== undefined,
      })),
    );
  });

  app.post('/admin/plugins/:id/:action{activate|deactivate}', requireRole('owner'), async (c) => {
    const tenantId = c.get('tenantId');
    const reg = await registryFor(tenantId);
    try {
      if (c.req.param('action') === 'activate') reg.activate(c.req.param('id'));
      else reg.deactivate(c.req.param('id'));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 409);
    }
    await deps.settings.setActivePlugins(
      tenantId,
      reg.activePlugins().map((p) => p.id),
    );
    return c.json({ active: reg.activePlugins().map((p) => p.id) });
  });

  // ---- Admin: setup wizard, Google sign-in ---------------------------------------
  const noGoogleSetup = { error: 'google-setup-unavailable' } as const;

  app.get('/admin/setup/google', requireRole('owner'), async (c) => {
    if (!deps.googleSetup) return c.json(noGoogleSetup, 503);
    const domain = deps.env.COGNITO_DOMAIN;
    return c.json({
      ...(await deps.googleSetup.status()),
      // The exact URL the coach pastes into Google Cloud Console as an authorised redirect URI.
      redirectUrl: domain ? `${domain}/oauth2/idpresponse` : null,
    });
  });

  app.put('/admin/setup/google', requireRole('owner'), async (c) => {
    if (!deps.googleSetup) return c.json(noGoogleSetup, 503);
    const parsed = parseGoogleClient(await c.req.json().catch(() => null));
    if (parsed.kind === 'invalid') return c.json({ error: 'invalid', fields: parsed.fields }, 400);
    try {
      await deps.googleSetup.configure(parsed.value);
    } catch (err) {
      // Cognito rejected it (e.g. a malformed client); nothing was saved.
      return c.json({ error: 'google-setup-failed', message: (err as Error).message }, 502);
    }
    return c.json({ configured: true, clientId: parsed.value.clientId });
  });

  // ---- Admin: branding and appearance --------------------------------------------
  app.put('/admin/branding', requireRole('owner'), async (c) => {
    const tenantId = c.get('tenantId');
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const k of [
      'appName',
      'shortName',
      'logoUrl',
      'activeThemeId',
      'tokenOverrides',
      'defaultLocale',
    ]) {
      if (k in body) update[k] = body[k];
    }
    if (typeof update.appName === 'string' && !update.appName.trim()) {
      return c.json({ error: 'appName must not be empty' }, 400);
    }
    const reg = await registryFor(tenantId);
    const current = resolveBranding(await deps.settings.getBranding(tenantId), deps.env);
    const next = { ...current, ...update } as typeof current;
    try {
      resolveTheme(
        reg.themes().map((p) => p.theme as ThemeDefinition),
        next.activeThemeId,
        next.tokenOverrides,
      );
    } catch (err) {
      if (err instanceof ThemeValidationError) return c.json({ error: err.message }, 400);
      throw err;
    }
    await deps.settings.saveBranding(tenantId, update);
    return c.json(resolveBranding(await deps.settings.getBranding(tenantId), deps.env));
  });

  // ---- Plugin routes: /api/p/<id>/..., 404 unless the plugin is active ------------
  for (const plugin of deps.plugins) {
    if (!plugin.routes) continue;
    const sub = new Hono<{ Variables: AuthVariables & { tenantId: string } }>();
    sub.use('*', async (c, next) => {
      const active = await deps.settings.getActivePlugins(c.get('tenantId'));
      if (!active.includes(plugin.id)) return c.json({ error: 'not found' }, 404);
      await next();
    });
    plugin.routes(sub);
    app.route(`/p/${plugin.id}`, sub);
  }

  return app;
}
