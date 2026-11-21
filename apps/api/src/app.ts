import { resolveBranding } from '@racket-club/core';
import {
  type PluginDefinition,
  PluginRegistry,
  resolveTheme,
  type ThemeDefinition,
  ThemeValidationError,
  themeStylesheet,
} from '@racket-club/plugin-sdk';
import { Hono, type MiddlewareHandler } from 'hono';
import { type AuthVariables, requireRole } from './auth';
import type { SettingsStore } from './settings-store';

export const CORE_VERSION = '0.1.0';

export interface AppDeps {
  // biome-ignore lint/suspicious/noExplicitAny: plugins carry their own settings types
  plugins: PluginDefinition<any>[];
  settings: SettingsStore;
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

  /** Build a registry reflecting which plugins this tenant has switched on. */
  const registryFor = async (tenantId: string) => {
    const reg = new PluginRegistry(deps.plugins, CORE_VERSION);
    for (const id of await deps.settings.getActivePlugins(tenantId)) {
      if (reg.installed().some((p) => p.id === id)) reg.activate(id);
    }
    return reg;
  };

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
      },
    });
  });

  app.get('/theme.css', async (c) => {
    const { theme } = await themeFor(c.get('tenantId'));
    c.header('content-type', 'text/css; charset=utf-8');
    c.header('cache-control', 'public, max-age=60');
    return c.body(themeStylesheet(theme));
  });

  app.get('/me', requireRole('owner', 'staff', 'student'), (c) => c.json(c.get('user')));

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
