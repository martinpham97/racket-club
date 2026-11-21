import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppConfig } from './config';
import { setLocale } from './i18n';
import { MockSignIn, type MockUser } from './MockSignIn';

/**
 * Phase 0 shell: branding, theme layout, language switch, mock sign-in and the plugin list.
 * Booking screens arrive in Phase 1. Every colour comes from --rc-* theme variables.
 */
export function App({ config }: { config: AppConfig }) {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<MockUser | null>(null);
  const lang = (i18n.language === 'vi' ? 'vi' : 'en') as 'en' | 'vi';

  return (
    <div
      className={`rc-app rc-nav-${config.theme.layout.nav} rc-density-${config.theme.layout.density}`}
    >
      <header className="rc-header">
        {config.branding.logoUrl && (
          <img src={config.branding.logoUrl} alt="" className="rc-logo" />
        )}
        <h1 data-testid="app-name">{config.branding.appName}</h1>
        <select
          aria-label={t('settings.language')}
          value={lang}
          onChange={(e) => void setLocale(e.target.value as 'en' | 'vi')}
        >
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </header>

      <main className="rc-main">
        <p className="rc-tagline">{t('app.tagline')}</p>

        {config.auth.mode === 'mock' && !user && <MockSignIn onSignIn={setUser} />}
        {config.auth.mode === 'cognito' && !user && (
          <a className="rc-button" href="/auth/sign-in">
            {t('auth.continueWithGoogle')}
          </a>
        )}
        {user && (
          <section className="rc-card">
            <p>
              {user.email} ({user.roles.join(', ')})
            </p>
            <button type="button" className="rc-button" onClick={() => setUser(null)}>
              {t('auth.signOut')}
            </button>
          </section>
        )}

        <section className="rc-card">
          <h2>Plugins</h2>
          <ul>
            {config.plugins.map((p) => (
              <li key={p.id}>{p.name[lang]}</li>
            ))}
          </ul>
        </section>
      </main>

      <nav className="rc-nav" aria-label="Main">
        <a href="/">{t('nav.home')}</a>
        <a href="/sessions">{t('nav.sessions')}</a>
        <a href="/inbox">{t('nav.inbox')}</a>
        <a href="/profile">{t('nav.profile')}</a>
      </nav>
    </div>
  );
}
