export interface AppConfig {
  branding: {
    appName: string;
    shortName: string;
    logoUrl: string | null;
    defaultLocale: 'en' | 'vi';
  };
  theme: {
    id: string;
    layout: { nav: 'bottom-tabs' | 'side-menu'; density: 'compact' | 'comfortable' };
  };
  locales: Array<'en' | 'vi'>;
  plugins: Array<{ id: string; name: { en: string; vi: string } }>;
  auth: { mode: 'mock' | 'cognito'; userPoolClientId: string | null; domain: string | null };
}

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Could not load app config (${res.status})`);
  return (await res.json()) as AppConfig;
}
