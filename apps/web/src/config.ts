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
  auth: {
    mode: 'mock' | 'cognito';
    userPoolClientId: string | null;
    domain: string | null;
    /** True once the coach has finished the "Google sign-in" setup step. */
    google: boolean;
  };
}

/** The signed-in person, from /api/me. */
export interface Me {
  userId: string;
  email: string;
  name: string;
  roles: Array<'owner' | 'staff' | 'student'>;
  locale: 'en' | 'vi';
  needsOnboarding: boolean;
}

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Could not load app config (${res.status})`);
  return (await res.json()) as AppConfig;
}
