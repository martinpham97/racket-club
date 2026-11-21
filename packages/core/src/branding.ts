/**
 * Branding is configured per deployment (and per tenant later). "Racket Club" is only the
 * default: a coach sets their own name at deploy time and in the setup wizard.
 * Visual styling comes from the active theme plugin; branding holds the coach's own values
 * that sit on top of it.
 */
export interface Branding {
  appName: string;
  shortName: string; // PWA home-screen label, max 12 characters
  logoUrl: string | null;
  activeThemeId: string;
  /** Coach overrides for tokens the active theme marks as editable, e.g. { 'color.primary': '#0b7a3e' } */
  tokenOverrides: Record<string, string>;
  defaultLocale: 'en' | 'vi';
  timezone: string;
  currency: string;
}

export const DEFAULT_BRANDING: Branding = {
  appName: 'Racket Club',
  shortName: 'Racket Club',
  logoUrl: null,
  activeThemeId: 'default',
  tokenOverrides: {},
  defaultLocale: 'en',
  timezone: 'Australia/Sydney',
  currency: 'AUD',
};

export function resolveBranding(
  saved: Partial<Branding> | undefined,
  env: Partial<Record<'APP_NAME' | 'DEFAULT_LOCALE' | 'TIMEZONE' | 'CURRENCY', string>> = {},
): Branding {
  const fromEnv: Partial<Branding> = {};
  if (env.APP_NAME) fromEnv.appName = env.APP_NAME;
  if (env.DEFAULT_LOCALE === 'en' || env.DEFAULT_LOCALE === 'vi') {
    fromEnv.defaultLocale = env.DEFAULT_LOCALE;
  }
  if (env.TIMEZONE) fromEnv.timezone = env.TIMEZONE;
  if (env.CURRENCY) fromEnv.currency = env.CURRENCY;

  const merged: Branding = { ...DEFAULT_BRANDING, ...fromEnv, ...stripUndefined(saved ?? {}) };
  if (!saved?.shortName) merged.shortName = truncate(merged.appName, 12);
  return merged;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max).trimEnd();
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
